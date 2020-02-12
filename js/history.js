/**
 * Created by guntherclaes on 04/04/16.
 */

var jiff = require('jiff');
const sri4node_common = require('sri4node/js/common.js');


module.exports = {

  handleHistoryListQueryResult: async function (tx, sriRequest, result) {
    var rows = result.body.results.map( e => e['$$expanded'] )
    rows.forEach(function (row, index) {
      // take in count that the query could bring different type of resources in the same result ('resources' parameter)
      var sameResourceVersions = rows.slice(index + 1)
                                     .filter(function (version) {
                                                return version.resource === row.resource;
                                              });

      var fromVersion = sameResourceVersions.length > 0 ? sameResourceVersions[0] : null;
      if (fromVersion) {
        row.from = '/versions/' + fromVersion.key;
      }
      row.to = '/versions/' + row.key;
      if (row.operation === 'UPDATE' || row.operation === 'MERGE') {
        row.patch = jiff.diff(fromVersion ? fromVersion.document : null, row.document);
      }

    });

    rows.forEach(function (row) {
      delete row['$$meta']
      delete row.key;
      delete row.document;
    });
    if(rows.length === (sriRequest.query.limit -1)){
      rows.splice(rows.length - 1);
    }
    result.body.results = rows
  },

  setFixedOrderForHistoryAndCheckSomeCustomPrerequisites: function ( tx, sriRequest ) {
    if (! sriRequest.query.resource && !sriRequest.query.resources) {
      throw new sri4node_common.SriError(
          { status: 404, 
            errors: [{code: 'resource.parameter.mandatory', msg: '\'resource\' is a mandatory search parameter.'}]
          })      
    } else {
      sriRequest.query.orderBy = 'timestamp';
      sriRequest.query.descending = 'true';
      if(sriRequest.query.limit){
        sriRequest.query.limit = parseInt(sriRequest.query.limit) + 1;
      }else{
        sriRequest.query.limit = 31;
      }
    }
  },

  //TODO: check if there is nothing in sri4node doing this
  resourcesFilter: async function (value, select) {
    var permalinks;
    if (value) {
      permalinks = value.split(',');
      select.sql(' and resource in (').array(permalinks).sql(') ');
    } else {
      throw 'resourcesFilter: value missing'
    }
  },
  orderFilter: function (direction) {
    return async function (value, select) {
      var operator;
      if (value) {
        if (Array.isArray(value)) {
          throw new sri4node_common.SriError(
              { status: 400, 
                errors: [{code: 'orderFilter.only.one.value.allowed', msg: 'orderFilter can only contain one value.', parameter: direction}]
              })
        } else {
          if (direction === 'from') {
            operator = '<=';
          } else {
            operator = '>=';
          }
          const { key } = sri4node_common.urlToTypeAndKey(value);
          select.sql(' AND timestamp ' + operator
            + ' (select timestamp from versions where key=\'' + key + '\')');
        }
      }
    };
  }

};
