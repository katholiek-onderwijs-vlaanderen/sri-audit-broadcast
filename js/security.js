/**
 * Created by guntherclaes on 04/04/16.
 */

module.exports = function (resourceToSecurityComponent, securityPlugin) {
  return {
    checkAccessOnResource: async function ( tx, sriRequest ) {
      // Only GET requests with specific resource specified can be checked in pre-process secure function,
      // others can only be checked in post-processing.
      let resources = []
      if (sriRequest.query.resource) {        
        resources = [ sriRequest.query.resource ]
      } else if (sriRequest.query.resources) {
        resources = sriRequest.query.resources.split(',')
      } 
      console.log("[audit/broadcast - security] check access on resource(s) - " + resources);
      await securityPlugin.customCheckBatch
                        ( tx
                        , sriRequest
                        , resources.map( (resource) => 
                              ({ component: resourceToSecurityComponent(resource), resource: resource, ability: 'read' }) )
                        )
    },
    doSecurityCheckGet: async function( tx, sriRequest, elements ) {
      await securityPlugin.customCheckBatch
                        ( tx
                        , sriRequest
                        , elements.map( ({ stored }) => 
                              ({ component: resourceToSecurityComponent(stored.resource), resource: stored.resource, ability: 'read' }) )
                        )
    },
    doSecurityCheckPut: async function( tx, sriRequest, elements ) {
      const component = resourceToSecurityComponent(resource);
      await securityPlugin.customCheck(tx, sriRequest, 'create', undefined, component)
    }
  };
};
