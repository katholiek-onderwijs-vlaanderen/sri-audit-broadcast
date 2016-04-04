/**
 * Created by guntherclaes on 04/04/16.
 */

var jiff = require('jiff');
var Q = require('q');

function handleGenericResponse (resp, obj) {
  resp.status(obj.status).send(obj);
}

module.exports = {
  handleHistoryListQueryResult: function (req, result) {
    var deferred = Q.defer();
    var rows = result.rows;
    rows.forEach(function (row, index) {

      // take in count that the query could bring different type of resources in the same result ('resources' parameter)
      var sameResourceVersions = rows.slice(index + 1).filter(function (version) {
        return version.resource === row.resource;
      });

      var fromVersion = sameResourceVersions.length > 0 ? sameResourceVersions[0] : null;
      if (fromVersion) {
        row.from = '/versions/' + fromVersion.key;
      }
      row.to = '/versions/' + row.key;
      //if (operation != 'DELETE') { // TODO: generate decent error message at these kind of errors
        row.patch = jiff.diff(fromVersion ? fromVersion.document : null, row.document);

    });

    rows.forEach(function (row) {
      delete row.key;
      delete row.document;
    });
    if(rows.length === (req.query.limit -1)){
      rows.splice(rows.length - 1);
    }

    deferred.resolve(rows);
    return deferred.promise;
  },
  setFixedOrderForHistoryAndCheckSomeCustomPrerequisites: function (req, resp, next) {
    if (req.path.split('/')[2]) {
      handleGenericResponse(resp, $u.generateError(
        404, 'no.list.resource.request', 'This resource can only be retrieved as list resource.'));
    } else if (! req.query.resource && !req.query.resources) {
      handleGenericResponse(resp, $u.generateError(404,
        'resource.parameter.mandatory', '\'resource\' is a mandatory search parameter.'));
    } else {
      req.query.orderBy = 'timestamp';
      req.query.descending = 'true';
      if(req.query.limit){
        req.query.limit = parseInt(req.query.limit) + 1;
      }else{
        req.query.limit = 31;
      }
      console.log(req.query.limit);
      next();
    }
  }
};