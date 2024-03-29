/**
 * Created by guntherclaes on 05/04/16.
 */

const pMap = require('p-map');
const sri4node = require('sri4node');
const $u = sri4node.utils;
const pgExec = $u.executeSQL;
const _ = require('lodash');

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

function calcType(json){
  if(json.type){
    return json.type;
  }else {
    return null;
  }

}

module.exports = {

  mapInsertDocument: function (_key, element, _isNewResource) {
    removeDollarDollarFieldsFromJSON(element);
    return element;
  },

  updateNotAllowed: async function ( tx, sriRequest, elements ) {
    elements.forEach( ({ incoming, stored }) => {
      module.exports.mapInsertDocument(incoming)
      if (!_.isEqual(incoming.document, stored.document)) {
        throw new sriRequest.SriError({status: 409, errors: 
                    [ { code: 'existing.version.cannot.be.updated'
                      , msg: 'Existing versions cannot be updated. A new version should be created.'} ]
                  })
      }
    })     
  },


  addPrevAndNextLinksToJson: async function( tx, sriRequest, elements ) {
    console.log("[audit/broadcast - version] addPrevAndNextLinksToJson");
    // only add prev and next links for individual resources, not in list 
    // otherwise much database queries and prev/next is propably not so relevant in list
    if (elements.length === 1) {
      // The current implemetation with the view is way too slow
      // TODO: implement this efficiently ! (a solution might be to store prev/next with the version and set
      // prev/next at insert)
      // const element = elements[0].stored;
      // const query = $u.prepareSQL('get_next_previous');
      // query.sql('select next, previous from versions_previous_next_view where key = ').param(element.key);
      // const [ row ] = await pgExec(tx, query);
      // if (row.next && row.next !== element.key) {
      //   element.$$meta.next = '/versions/' + row.next;
      // }
      // if (row.previous && row.previous !== element.key) {
      //   element.$$meta.previous = '/versions/' + row.previous;
      // }
    }
  },


  notSameVersion: async function ( tx, sriRequest, elements ) {
    await pMap(elements, async ({ permalink, incoming, stored }) => {
      console.log(`[audit/broadcast - version - ${permalink} ] PUT version was:' + JSON.stringify(incoming)`);
      const query = $u.prepareSQL("validation");
      if (incoming.operation === 'INITIALIZE') {
        query.sql('SELECT * FROM versions WHERE resource = ').param(incoming.resource)
             .sql('LIMIT 1');
        const [ row ] = await pgExec(tx, query);
        module.exports.mapInsertDocument(incoming);
        if (row != undefined  && !_.isEqual(row.document, incoming.document)) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'already.initialized'
                        , version: permalink
                        , msg: 'There are already versions of this resource. You can not initialize or create them.'} ]
                    })
        }
      } else if (incoming.operation === 'UPDATE') {
        query.sql('SELECT * FROM versions WHERE key != ').param(incoming.key)
             .sql(' AND resource = ').param(incoming.resource)
             .sql(' ORDER BY timestamp desc LIMIT 1');
        const [ row ] = await pgExec(tx, query);
        module.exports.mapInsertDocument(incoming);
        if (row != undefined  && _.isEqual(row.document, incoming.document)) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'same.version'
                        , version: permalink
                        , msg: 'This version is the same as the previous.'} ]
                    })
        }
      } else if (incoming.operation === 'MERGE') {
        query.sql('SELECT * FROM versions WHERE key != ').param(incoming.key)
             .sql(' AND resource = ').param(incoming.resource)
             .sql(' ORDER BY timestamp desc LIMIT 1');
        const [ row ] = await pgExec(tx, query);
        module.exports.mapInsertDocument(incoming);
        if (row != undefined  && _.isEqual(row.mergedResource, incoming.mergedResource)) {
          throw new sriRequest.SriError({status: 409, errors: 
                      [ { code: 'same.version'
                        , version: permalink
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
