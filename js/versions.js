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

function removePersonContactDetailsFromJSON (type, json) {
  console.log('[audit/broadcast - version] putted type: ' + type);
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
        if (key === 'emailAddresses' | key === 'addresses' | key === 'phones' | key === 'bankAccounts') {
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
    removePersonContactDetailsFromJSON(calcType(element), element);
    removeDollarDollarFieldsFromJSON(element);
    return element;
  },
  notSameVersion: function (body, database) {
    console.log('[audit/broadcast - version] PUT version was:' + JSON.stringify(body));

    var d = Q.defer();
    console.log("[audit/broadcast - version validation] starting validation");
    var query = $u.prepareSQL("validation");
    if(body.operation === 'INITIALIZE'){
      console.log("[audit/broadcast - version validation] Checking if already version");
      query.sql('SELECT count(*) FROM versions WHERE resource = ').param(body.resource);
      $u.executeSQL(database, query, false, false)
        .then(function(data){
          if (data.rows[0].count > 0) {
            console.log("[audit/broadcast - version validation] There are already versions of this resource. You can not initialize or create them");
            d.reject({
              statusCode: 409,
              body: {
                code: 'initialize.first',
                message: 'There are already versions of this resource. You can not initialize or create them.'
              }
            });
          }else{
            console.log("[audit/broadcast - version validation] DONE - initialize.first");
            d.resolve();
          }
        }, function (err) {
          //Should not not put if database fails.. we want the versions
          console.warn({error: 'database.error.validation.', message: err});
          d.resolve();
        }
      ).catch(function (err) {
          console.warn('[audit/broadcast - version validation - database] Sending internal server error 500 to client');
          db.done(err);
          d.reject(err);
        }
      );
    }else if(body.operation === 'UPDATE'){
      console.log("[audit/broadcast - version validation] Checking if same version");
      query.sql('SELECT * FROM versions WHERE resource = ').param(body.resource).sql(' ORDER BY timestamp desc LIMIT 1');
      $u.executeSQL(database, query, false, false)
        .then(function(data){
          removePersonContactDetailsFromJSON(body.type, body.document);
          removeDollarDollarFieldsFromJSON(body.document);
          if(JSON.stringify(data.rows[0].document) == JSON.stringify(body.document)){
            console.log("[audit/broadcast - version validation] This version is the same as the previous");
            d.reject({
              statusCode: 409,
              body: {
                code: 'same.version',
                message: 'This version is the same as the previous.'
              }
            });
          }else{
            console.log("[audit/broadcast - version validation] DONE - same.version");
            d.resolve();e
          }
        }, function (err) {
          //Should not not put if database fails.. we want the versions
          console.warn({error: 'database.error.validation.', message: err});
          d.resolve();
        }
      ).catch(function (err) {
          console.warn('[audit/broadcast - version validation - database] Sending internal server error 500 to client');
          db.done(err);
          d.reject(err);
        }
      );
    } else {
      d.resolve();
    }
    console.log("[audit/broadcast - version validation] ALL DONE");
    return d.promise;
  }
};
