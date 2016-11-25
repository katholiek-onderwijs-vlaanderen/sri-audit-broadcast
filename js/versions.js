/**
 * Created by guntherclaes on 05/04/16.
 */

var Q = require('q');
var sri4node = require('sri4node');
var $u = sri4node.utils;
var _ = require('lodash');
var jiff = require('jiff');

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

function removePersonContactDetailsFromJSON (type, json) {
  if(type === 'PERSON') {
    doRemoval(type, json);
  }
  function doRemoval(type, json){
    if (json instanceof Array) {
      json.forEach(function (e) {
        doRemoval(type, e);
      });
    } else if (json instanceof Object) {
      Object.keys(json).forEach(function (key) {
        if (json[key] instanceof Object) {
          doRemoval(type, json[key]);
        }
        //Should also add mergedPersons in the future
        if (key === 'emailAddresses' || key === 'addresses' || key === 'phones' || key === 'bankAccounts') {
          delete json[key];
        }
      });
    }
  }
};

function calcType(json){
  if(json.type){
    return json.type;
  }else {
    return null;
  }

}

module.exports = {
  onlyAllowInsertNoUpdate: function (elm, database) {
    var deferred = Q.defer();
    var query = $u.prepareSQL("validationUpdate");
    query.sql('SELECT * FROM versions WHERE key = ').param(elm.key);
    $u.executeSQL(database, query)
      .then(function(data){
        if (data.rows.length > 0 && jiff.diff(data.rows[0].document, elm.document).length != 0) {
              deferred.reject({
                statusCode: 409,
                body: {
                  code: 'existing.version.cannot.be.updated',
                  message: 'Existing versions cannot be updated. A new version should be created.'
                }
              });
          }else{
            deferred.resolve();
          }
        }, function (err) {
          console.warn({error: 'database.error.validation.', version: '/versions/' + elm.key, message: err});
          deferred.reject();
        }
      ).catch(function (ex) {
        console.error(ex.stack);
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
    removePersonContactDetailsFromJSON(calcType(element), element);
    removeDollarDollarFieldsFromJSON(element);
    return element;
  },
  notSameVersion: function (body, database) {
    //console.log('[audit/broadcast - version - /versions/' + body.key +'] PUT version was:' + JSON.stringify(body));

    var d = Q.defer();
    var query = $u.prepareSQL("validation");
    if(body.operation === 'INITIALIZE'){
      query.sql('SELECT count(*) FROM versions WHERE resource = ').param(body.resource);
      $u.executeSQL(database, query, false, false)
        .then(function(data){
          if (data.rows[0].count > 0) {
            d.reject({
              statusCode: 409,
              body: {
                code: 'initialize.first',
                version: '/versions/' + body.key,
                message: 'There are already versions of this resource. You can not initialize or create them.'
              }
            });
          }else{
            d.resolve();
          }
        }, function (err) {
          //Should not not rollback if database fails.. we want the versions
          console.warn({error: 'database.error.validation.', version: '/versions/' + body.key, message: err});
          d.resolve();
        }
      );
    }else if(body.operation === 'UPDATE'){
      query.sql('SELECT * FROM versions WHERE key != ').param(body.key).sql(' AND resource = ').param(body.resource).sql(' ORDER BY timestamp desc LIMIT 1');
      $u.executeSQL(database, query, false, false)
        .then(function(data){
          removePersonContactDetailsFromJSON(body.type, body.document);
          removeDollarDollarFieldsFromJSON(body.document);
          if(data.rowCount > 0 && _.isEqual(data.rows[0].document, body.document)){
            d.reject({
              statusCode: 409,
              body: {
                code: 'same.version',
                version: '/versions/' + body.key,
                message: 'This version is the same as the previous.'
              }
            });
          }else{
            d.resolve();
          }
        }, function (err) {
          //Should not not rollback if database fails.. we want the versions
          console.warn({error: 'database.error.validation.', version: '/versions/' + body.key, message: err});
          d.resolve();
        }
      );
    } else {
      d.resolve();
    }
    return d.promise;
  }
};
