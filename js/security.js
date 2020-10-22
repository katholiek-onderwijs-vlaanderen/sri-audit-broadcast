/**
 * Created by guntherclaes on 04/04/16.
 */

module.exports = function (resourceToSecurityComponent, securityPlugin) {
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
      console.log("[audit/broadcast - security] check access on resource(s) - " + resources);
      await resourceToSecurityComponent(resource).securityPlugin.allowedCheckBatch
                        ( tx
                        , sriRequest
                        , resources.map( (resource) => 
                              ({ component: resourceToSecurityComponent(resource).component, resource: resource, ability: 'read' }) )
                        )
    },

    doSecurityCheckGet: async function( tx, sriRequest, elements ) {
      await resourceToSecurityComponent(resource).securityPlugin.allowedCheckBatch
                        ( tx
                        , sriRequest
                        , elements.map( ({ stored }) => 
                              ({ component: resourceToSecurityComponent(stored.resource).component, resource: stored.resource, ability: 'read' }) )
                        )
    },
    doSecurityCheckPut: async function( tx, sriRequest, elements ) {
      await securityPlugin.allowedCheckBatch
                        ( tx
                        , sriRequest
                        , elements.map( ({ incoming }) => 
                              ({ component: '/security/components/audit-broadcast-api', ability: 'create' }) )
                        )
    }
  };
};
