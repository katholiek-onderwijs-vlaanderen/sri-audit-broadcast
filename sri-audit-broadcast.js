/**
 * Created by guntherclaes on 01/12/15.
 */

const  inflect = require('i')();

const  sri4node = require('sri4node');
const  $u = sri4node.utils;
const  $s = sri4node.schemaUtils;
const  $q = sri4node.queryUtils;
const  url = require('url');

module.exports = {

  init: async function (config) {

    const redis_url = process.env.REDIS_URL
    if (!redis_url || redis_url == '') {
      console.log('FATAL: no redis url configured!');
      process.exit(1);
    }


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
    if(!config.securityPlugin){ configParamNotSet('securityPlugin')  }


    //Load configuration
    const  app = config.app;
    const  srv = config.server;
    const  pg = config.pg;

    const  io = require('socket.io').listen(srv, {log: false}); // using "old" socket.io because socket.io 1.0 seems to have a long connection setup on heroku with lots of probe packets

    const  redis = require('redis');
    const  RedisStore = require('socket.io/lib/stores/redis');
    const  redisURL = url.parse(redis_url);

    const  security = require('./js/security.js')(config.resourceToSecurityComponent, config.securityPlugin);
    const  history = require('./js/history.js');
    const  versions = require('./js/versions.js');


    const  broadcast = async function (database, elements) {
      // TODO: check sri4node: error like invalid element.type is silently thrown away??
      elements.forEach(function(element) {
        const  resourceName = '/' + inflect.pluralize(element.body.type.toLowerCase());
        if (resourceName === '/people') {
          // seems we don't use the ordinary plural of person...
          resourceName = '/persons'
        }
        const  notificationMsg = {
          current: '/versions/' + element.body.key,
          previous: 'TODO!', //TODO lookup with db query
          timestamp: element.body.timestamp,
          person: element.body.person,
          operation: element.body.operation,
          type: element.body.type,
          permalink: element.body.resource
        };

        console.log('[audit/broadcast - broadcast] Room: ' + resourceName);
        console.log('[audit/broadcast - broadcast] Message: ' + JSON.stringify(notificationMsg));
        io.sockets.to(resourceName).emit('update', notificationMsg);
        io.sockets.to(element.body.resource).emit('update', notificationMsg);
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
          schema: {
            $schema: 'http://json-schema.org/schema#',
            title: 'A regular resource that contains a specific version of a resource in the API.',
            type: 'object',
            properties: {
              key: $s.guid(''),
              timestamp: $s.timestamp('A timestamp when the update occurred. This timestamp is generated on '
                + 'the client that performs a PUT to /version/{guid}.'),
              person: $s.permalink('A permalink to the person that made the modification.'),
              component: $s.string('A permalink to the /security/component that manages this resource.'),
              operation: {
                description: 'Opperation that has been performed on the resource',
                enum: ['CREATE', 'UPDATE', 'DELETE', 'INITIALIZE', 'MERGE']
              },
              type: $s.string('The $$meta.type of the original resource.'),
              resource: $s.string('Permalink of the resource'),
              // mergedResource: $s.string('Resouce that the document has merged with'),
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
            // mergedResource: {},
            document: {oninsert: versions.mapInsertDocument}
          },

          beforeInsert: [ versions.requireDocumentOnCreateOrUpdate ],
          afterRead:    [ security.doSecurityCheckGet ],
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
    
    config.securityPlugin.init(sriConfig)
    await sri4node.configure(app, sriConfig)


    // broadcast part
    const  pub = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase
    const  sub = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase
    const  client = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase

    if (redisURL.auth) {
      pub.auth(redisURL.auth.split(':')[1]);
      sub.auth(redisURL.auth.split(':')[1]);
      client.auth(redisURL.auth.split(':')[1]);
    }

    io.set('store', new RedisStore({
                                     redis: redis,
                                     redisPub: pub,
                                     redisSub: sub,
                                     redisClient: client
                                   }));
    app.get('/updates', config.securityPlugin.getOauthValve().authenticationMiddleware(true), function (req, res) {
      const  forwardProto = req.get('X-Forwarded-Proto');
      res.send({href: (forwardProto ? forwardProto : req.protocol) + '://' + req.headers.host});
    });

    app.get('/rooms', config.securityPlugin.getOauthValve().authenticationMiddleware(true), function (req, res) {
      res.send({rooms: Object.keys(io.sockets.adapter.rooms)});
    });

    app.use('/test', config.express.static(__dirname + '/test/test.html'));

    io.sockets.on('connection', function (socket) {
      console.log('[audit/broadcast - socket] Received Connection');
      socket.on('join', function (roomName) {
        console.log('[audit/broadcast - socket] Joining Room: ' + roomName);
        socket.join(roomName);
      });
      socket.on('leave', function (roomName) {
        console.log('[audit/broadcast - socket] Leaving Room: ' + roomName);
        socket.leave(roomName);
      });
    });

  }

};
