/**
 * Created by guntherclaes on 04/04/16.
 */
const  _ = require('lodash');
const  pEachSeries = require('p-each-series');

module.exports = function (resourceToSecurityComponent, securityPlugins) {
  
  const doSecurityQueryBasedOnResourceToSecurityComponent = async function ( tx, sriRequest, resources ) {
    const securityPluginMap = new Map(securityPlugins.map(sp => [sp.getBaseUrl(), sp]));
    const groupedResources = _.groupBy(resources, r => resourceToSecurityComponent(r).securityPlugin.getBaseUrl());

    await pEachSeries(Object.keys(groupedResources), securityPluginBaseUrl => {
      console.log("[audit/broadcast - security] check access on resource(s) - " + resources);
      console.log("[audit/broadcast - security] quering security server " + securityPluginBaseUrl);
      return securityPluginMap.get(securityPluginBaseUrl).allowedCheckWithRawAndIsPartOfBatch
                        ( tx
                        , sriRequest
                        , groupedResources[securityPluginBaseUrl].map( (resource) => 
                              ({ component: resourceToSecurityComponent(resource).component, resource: resource, ability: 'read' }) )
                        )
    });
  };

  return {
    checkIfTypeIsMappedToSecurityComponent: async function ( tx, sriRequest, elements ) {
      elements.forEach( ({ incoming }) => {
          if (resourceToSecurityComponent(incoming.resource) === null) {
            throw new sriRequest.SriError(
                { status: 501, 
                  errors: [{code: 'resourcetype.is.not.mapped', msg: 'The type of the resource is not mapped to a security component.', parameter: incoming.resource}]
                })
          }
        })
    },

    checkAccessOnResource: async function ( tx, sriRequest ) {
      // Only GET requests with specific resource specified can be checked in pre-process secure function,
      // others can only be checked in post-processing.
      let resources = []
      if (sriRequest.query.resource) {        
        resources = [ sriRequest.query.resource ]
      } else if (sriRequest.query.resources) {
        resources = sriRequest.query.resources.split(',')
      } 
      await doSecurityQueryBasedOnResourceToSecurityComponent(tx, sriRequest, resources);
    },

    doSecurityCheckGet: async function( tx, sriRequest, elements ) {
      const resources = elements.map( ({ stored }) => stored.resource );
      await doSecurityQueryBasedOnResourceToSecurityComponent(tx, sriRequest, resources);
    },
    doSecurityCheckPut: async function( tx, sriRequest, elements ) {
      await securityPlugins[1].allowedCheckWithRawAndIsPartOfBatch
                        ( tx
                        , sriRequest
                        , elements.map( ({ incoming }) => 
                              ({ component: '/security/components/audit-broadcast-api', ability: 'create' }) )
                        )
    }
  };
};
