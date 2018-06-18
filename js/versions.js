/**
 * Created by guntherclaes on 05/04/16.
 */

const sri4node = require('sri4node');
const $u = sri4node.utils;

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
        if (key === 'emailAddresses' || key === 'addresses' || key === 'phones' || key === 'bankAccounts' || key === 'mergedPersons') {
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

  mapInsertDocument: function (element) {
    removePersonContactDetailsFromJSON(calcType(element), element);
    removeDollarDollarFieldsFromJSON(element);
    return element;
  },

  updateNotAllowed: async function ( tx, sriRequest, elements ) {
    elements.forEach( ({ incoming, stored }) => {
      mapInsertDocument(incoming)
      if (!_.isEqual(incoming.document, incoming.document)) {
        throw new sriRequest.SriError({status: 409, errors: 
                    [ { code: 'existing.version.cannot.be.updated'
                      , msg: 'Existing versions cannot be updated. A new version should be created.'} ]
                  })
      }
    })     
  },

//not used?
  // addPrevAndNextLinksToJson: async function (database, elements, me) {
  //   console.log("[audit/broadcast - version] addPrevAndNextLinksToJson");
  //   await pMap()
  //   return Q.all(elements.map(function (element) {
  //     const deferred = Q.defer();
  //     const query = $u.prepareSQL('key');
  //     query.sql('select next, previous from versions_previous_next_view where key = ').param(element.key);
  //     $u.executeSQL(database, query).then(function (result) {
  //       if (result.rows[0].next && result.rows[0].next !== element.key) {
  //         element.$$meta.next = '/versions/' + result.rows[0].next;
  //       }
  //       if (result.rows[0].previous && result.rows[0].previous !== element.key) {
  //         element.$$meta.previous = '/versions/' + result.rows[0].previous;
  //       }
  //       deferred.resolve();
  //     }).catch(function (err) {
  //       console.log(err);
  //       deferred.reject(err);
  //     });
  //     return deferred.promise;
  //   }));

  // },



  notSameVersion: async function ( tx, sriRequest, [ elements ] ) {
    //console.log('[audit/broadcast - version - /versions/' + body.key +'] PUT version was:' + JSON.stringify(body));
    await pMap(elements, async ({ incoming, stored }) => {
      const query = $u.prepareSQL("validation");
      if (incoming.operation === 'INITIALIZE') {
        query.sql('SELECT * FROM versions WHERE resource = ').param(body.resource);
        const rows = await pgExec(tx, query);
        mapInsertDocument(incoming)
        if (rows.length > 0  && !_.isEqual(rows[0].document, incoming.document)) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'already.initialized'
                        , version: '/versions/' + incoming.key
                        , msg: 'There are already versions of this resource. You can not initialize or create them.'} ]
                    })
        }
      } else if (incoming.operation === 'UPDATE') {
        query.sql('SELECT * FROM versions WHERE key != ').param(incoming.key).sql(' AND resource = ').param(incoming.resource).sql(' ORDER BY timestamp desc LIMIT 1');
        const rows = await pgExec(tx, query);
        mapInsertDocument(incoming)
        if (rows.length > 0 && _.isEqual(rows[0].document, incoming.document) &&rows[0].key != incoming.key) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'same.version'
                        , version: '/versions/' + incoming.key
                        , msg: 'This version is the same as the previous.'} ]
                    })          
        }
      }
    }, { concurrency: 1 })
  },

  requireDocumentOnCreateOrUpdate: async function ( tx, sriRequest, elements ) {
    elements.forEach( ({ incoming }) => {
      if (! incoming.document) {
        if (['CREATE', 'UPDATE'].indexOf(incoming.operation) > -1) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'document.required'
                        , msg: 'Create or update must requires a \'document\' field.'} ]
                    })        
        }
      }
    })
  }
};
