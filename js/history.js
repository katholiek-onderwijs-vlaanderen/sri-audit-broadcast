/**
 * Created by guntherclaes on 04/04/16. test
 */

var jiff = require('jiff');
var Q = require('q');

function handleGenericResponse (resp, obj) {
  resp.status(obj.status).send(obj);
}

function parsePermalink (permalink) {
  var deferred = Q.defer();
  var ret, key, splitted;
  // TODO: check on only  letters in type en only hex in key !
  ret = {};
  if (typeof permalink === 'string') {
    splitted = permalink.split('/');
    if (splitted.length === 3) {
      ret.resourcetype = inflect.singularize(splitted[1]).toUpperCase();
      key = splitted[2];
      if (key.length === 36) {
        ret.key = key;
        deferred.resolve(ret);
      } else {
        deferred.reject({
          code: 'parameter.invalid.resource.uuid',
          value: key
        });
      }
    } else {
      deferred.reject({
        code: 'parameter.invalid.value',
        value: permalink
      });
    }
  } else {
    deferred.reject({
      code: 'parameter.invalid.value',
      value: permalink
    });
  }
  return deferred.promise;
};


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
      if (row.operation === 'UPDATE' ) {
        row.patch = jiff.diff(fromVersion ? fromVersion.document : null, row.document);
      }

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
      next();
    }
  },
  resourcesFilter: function (value, select) {
    var deferred = Q.defer();
    var permalinks;
    if (value) {
      permalinks = value.split(',');

      select.sql(' and resource in (').array(permalinks).sql(') ');
      deferred.resolve();
    } else {
      deferred.reject();
    }
    return deferred.promise;
  },
  orderFilter: function (direction) {
    return function (value, select) {
      var deferred = Q.defer();
      var operator;
      if (value) {
        if (Array.isArray(value)) {
          //TODO: adapr to work in sri4node
          deferred.reject({
            code: 'only.one.value.allowed',
            parameter: direction
          });
        } else {
          if (direction === 'from') {
            operator = '<=';
          } else {
            operator = '>=';
          }
          parsePermalink(value).then(function (result) {
            select.sql(' AND timestamp ' + operator
              + ' (select timestamp from versions where key=\'' + result.key + '\')');
            deferred.resolve();
          });
        }
      } else {
        deferred.resolve();
      }
      return deferred.promise;
    };
  }

};
