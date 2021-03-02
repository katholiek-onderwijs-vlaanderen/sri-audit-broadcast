/**
 * Created by guntherclaes on 01/12/15.
 */

const  inflect = require('i')();
const  _ = require('lodash');

const  sri4node = require('sri4node');
const  $u = sri4node.utils;
const  $s = sri4node.schemaUtils;
const  $q = sri4node.queryUtils;
const  url = require('url');

module.exports = {

  init: async function (config) {

    //Check configuration
    const  configParamNotSet = function (param){
      console.error('[audit/broadcast - configuration]' + param + ' parameter is not set. Check your configuration!');
      process.exit();
    };

    if(!config.app){ configParamNotSet('app')  }
    if(!config.server){ configParamNotSet('server')  }
    if(!config.express){ configParamNotSet('express')  }
    // if(!config.oauthValve){ configParamNotSet('oauthValve')  }

    if(!config.resourceToSecurityComponent){ configParamNotSet('resourceToSecurityComponent')  }
    if(!config.securityPlugins){ configParamNotSet('securityPlugins')  }


    //Load configuration
    const  app = config.app;
    const  srv = config.server;
    const  pg = config.pg;

    
    const io = require('socket.io')(srv);
    const postgresAdapter = require('socket.io-adapter-postgres');
    io.adapter(postgresAdapter(process.env.DATABASE_URL));

    const  security = require('./js/security.js')(config.resourceToSecurityComponent, config.securityPlugins);
    const  history = require('./js/history.js');
    const  versions = require('./js/versions.js');


    const  broadcast = async function ( tx, sriRequest, elements ) {
      elements.forEach(function({ permalink, stored, incoming }) {
        let resourceName = '/' + inflect.pluralize(incoming.type.toLowerCase());
        if (resourceName === '/people') {
          // seems we don't use the ordinary plural of person...
          resourceName = '/persons'
        }
        const  notificationMsg = {
          current: permalink,
          previous: stored !== null ? `/versions/${stored.key}` : null,
          timestamp: incoming.timestamp,
          person: incoming.person,
          operation: incoming.operation,
          type: incoming.type,
          permalink: incoming.resource
        };

        console.log('[audit/broadcast - broadcast] Room: ' + resourceName);
        console.log('[audit/broadcast - broadcast] Message: ' + JSON.stringify(notificationMsg));
        io.to(resourceName).emit('update', notificationMsg);
        io.to(incoming.resource).emit('update', notificationMsg);
      });
    };


    sriConfig = {
      logrequests : true,
      logsql: true,
      logdebug: true,


      resources: [
        {
          type: '/versions',
          methods: [ 'GET', 'PUT' ],
          public: false,
          listResultDefaultIncludeCount: false,
          schema: {
            $schema: 'http://json-schema.org/schema#',
            title: 'A regular resource that contains a specific version of a resource in the API.',
            type: 'object',
            properties: {
              key: $s.guid(''),
              timestamp: $s.timestamp('A timestamp when the update occurred. This timestamp is generated on '
                + 'the client that performs a PUT to /version/{guid}.'),
              person: $s.string('A permalink to the person that made the modification.'),
              component: $s.string('A permalink to the /security/component that manages this resource.'),
              operation: {
                description: 'Opperation that has been performed on the resource',
                enum: ['CREATE', 'UPDATE', 'DELETE', 'INITIALIZE', 'MERGE']
              },
              type: $s.string('The $$meta.type of the original resource.'),
              resource: $s.string('Permalink of the resource'),
              mergedResource: $s.string('Resouce that the document has merged with'),
              document: {
                oneOf: [
                  {
                    type: 'null'
                  },
                  {
                    type: 'object',
                    description: 'The full resource as it was in this version, at the given timestamp.'
                  }
                ]
              }
            },
            required: [
              'key',
              'timestamp',
              'person',
              'component',
              'operation',
              'type',
              'resource'
            ]
          },
          query: {
            defaultFilter: $q.defaultFilter
          },
          map: {
            key: {},
            timestamp: {},
            person: {},
            component: {},
            operation: {},
            type: {},
            resource: {},
            mergedResource: {},
            document: {fieldToColumn: [ versions.mapInsertDocument ]}
          },

          beforeInsert: [ versions.requireDocumentOnCreateOrUpdate, security.checkIfTypeIsMappedToSecurityComponent ],
          afterRead:    [ security.doSecurityCheckGet, versions.addPrevAndNextLinksToJson ],
          afterUpdate:  [ versions.updateNotAllowed ],
          afterInsert:  [ security.doSecurityCheckPut, versions.notSameVersion, broadcast ],

          customRoutes: [ {
                            like: "",
                            routePostfix: "/history",
                            httpMethods: ['GET'],
                            alterMapping: (mapping) => {
                              mapping.beforeRead = [ security.checkAccessOnResource, history.setFixedOrderForHistoryAndCheckSomeCustomPrerequisites ]
                              mapping.afterRead = [ ]

                              mapping.query = {
                                from: history.orderFilter('from'),
                                tokey: history.orderFilter('to'),
                                resources: history.resourcesFilter,
                                defaultFilter: $q.defaultFilter
                              };

                              mapping.schema.properties.patch = {
                                type: 'object',
                                description: 'A JSON patch (rfc6902) between this and previous verion. Only present for UPDATE operations.'
                              };
                              mapping.schema.properties.from = $s.string('A permalink to the previous version (if existing).');
                              mapping.schema.properties.to = $s.string('A permalink to the current version.');             

                              mapping.transformResponse = [ history.handleHistoryListQueryResult ];
                            }
                          } ]
        }],     
    };
    
    config.securityPlugins.forEach(p => p.init(sriConfig));
    await sri4node.configure(app, sriConfig)

    app.get('/updates', config.securityPlugins[1].getOauthValve().authenticationMiddleware(true), function (req, res) {
      const  forwardProto = req.get('X-Forwarded-Proto');
      res.send({href: (forwardProto ? forwardProto : req.protocol) + '://' + req.headers.host});
    });

    app.get('/stats', config.securityPlugins[1].getOauthValve().authenticationMiddleware(true), function (req, res) {      
      const [ subscribedResources, socketIds ] = _.partition(Object.keys(io.sockets.adapter.rooms), s => s.startsWith('/') );
      res.send({ nrConnections: socketIds.length, subscribedResources: subscribedResources });
    });


    app.use('/test', config.express.static(__dirname + '/test/test.html'));


    io.on('connection', client => {
      console.log('[audit/broadcast - socket] Received Connection');
      client.on('join', roomName => {
        console.log('[audit/broadcast - socket] Joining Room: ' + roomName);
        client.join(roomName);
      });
      client.on('leave', roomName => {
        console.log('[audit/broadcast - socket] Leaving Room: ' + roomName);
        client.leave(roomName);
      });
    });

  }

};
