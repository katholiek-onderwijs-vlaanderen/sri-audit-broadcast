/**
 * Created by guntherclaes on 05/04/16.
 */

var Q = require('q');
var sri4node = require('sri4node');
var $u = sri4node.utils;

function removeDollarDollarFieldsFromJSON (json) {
  if (json instanceof Array) {
    json.forEach(function (e) {
      removeDollarDollarFieldsFromJSON(e);
    });
  } else if (json instanceof Object) {
    Object.keys(json).forEach(function (key) {
      if (json[key] instanceof Object) {
        removeDollarDollarFieldsFromJSON(json[key]);
      }
      if (key.substr(0, 2) === '$$') {
        delete json[key];
      }
    });
  }
};

module.exports = {
  onlyAllowInsertNoUpdate: function () {
    var deferred = Q.defer();
    deferred.reject({
      statusCode: 409,
      body: {
        code: 'existing.version.cannot.be.updated',
        message: 'Existing versions cannot be updated. A new version should be created.'
      }
    });
    return deferred.promise;
  },
  addPrevAndNextLinksToJson: function (database, elements, me) {
    console.log("[audit/broadcast - version] addPrevAndNextLinksToJson");

    return Q.all(elements.map(function (element) {
      var deferred = Q.defer();
      var query = $u.prepareSQL('key');
      query.sql('select next, previous from versions_previous_next_view where key = ').param(element.key);
      $u.executeSQL(database, query).then(function (result) {
        console.log(result);
        if (result.rows[0].next && result.rows[0].next !== element.key) {
          element.$$meta.next = '/versions/' + result.rows[0].next;
        }
        if (result.rows[0].previous && result.rows[0].previous !== element.key) {
          element.$$meta.previous = '/versions/' + result.rows[0].previous;
        }
        deferred.resolve();
      }).catch(function (err) {
        console.log(err);
        deferred.reject(err);
      });
      return deferred.promise;
    }));

  },
  mapInsertDocument: function (key, element) {
    removeDollarDollarFieldsFromJSON(element);
    return element;
  },
  notSameVersion: function (body, database) {
    var d = Q.defer();
    console.log("[audit/broadcast - version] starting validation");
    var query = $u.prepareSQL("validation");
    if(body.operation === 'INITIALIZE' || body.operation === 'CREATE'){
      console.log("[audit/broadcast - version] Checking if already version");
      query.sql('SELECT count(*) FROM versions WHERE resource = ').param(body.resource);
      $u.executeSQL(database, query).then(function(data){
        console.log(data);
        if (data.rows[0].count > 0) {
          console.log("[audit/broadcast - version] There are already versions of this resource. You can not initialize or create them");
          d.reject({
            statusCode: 409,
            body: {
              code: 'initialize.first',
              message: 'There are already versions of this resource. You can not initialize or create them.'
            }
          });
        }else{
          d.resolve();
        }
      }).catch(function (err) {
        console.log(err);
        d.reject(err);
      });
    }else{
      console.log("[audit/broadcast - version] Checking if same version");
      query.sql('SELECT * FROM versions WHERE resource = ').param(body.resource).sql(' ORDER BY timestamp desc');
      $u.executeSQL(database, query).then(function(data){
        removeDollarDollarFieldsFromJSON(body.document);
        console.log(body.document);
        if(JSON.stringify(data.rows[0].document) == JSON.stringify(body.document)){
          console.log("[audit/broadcast - version] This version is the same as the previous");
          d.reject({
            statusCode: 409,
            body: {
              code: 'same.version',
              message: 'This version is the same as the previous.'
            }
          });
        }else{
          console.log("Validation DONE");
          d.resolve();
        }
      }).catch(function (err) {
        console.log(err);
        d.reject(err);
      });
    }
    return d.promise;
  }
};