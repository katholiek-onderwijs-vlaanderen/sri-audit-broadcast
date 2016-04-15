/**
 * Created by guntherclaes on 01/12/15.
 */

var inflect = require('i')();

var sri4node = require('sri4node');
var $u = sri4node.utils;
var $s = sri4node.schemaUtils;
var $q = sri4node.queryUtils;
var url = require('url');
var Q = require('q');

module.exports = {

  init: function (config) {

    //Check configuration
    var configParamNotSet = function (param){
      console.error('[audit/broadcast - configuration]' + param + ' parameter is not set. Check your configuration!');
      process.exit();
    };

    if(!config.app){ configParamNotSet('app')  }
    if(!config.server){ configParamNotSet('server')  }
    if(!config.pg){ configParamNotSet('pg')  }
    if(!config.express){ configParamNotSet('express')  }
    if(!config.authenticate){ configParamNotSet('authenticate')  }
    if(!config.identify){ configParamNotSet('identify')  }
    if(!config.security){ configParamNotSet('security')  }
    if(!config.security.host){ configParamNotSet('security.host')  }
    if(typeof config.security.enabled === 'undefined'){
      configParamNotSet('security.enabled')
    }else{
      if(!config.security.component){ configParamNotSet('security.component')  }
      if(typeof config.security.component != 'function'){
        console.error('[audit/broadcast - configuration] security.component has to be a function!');
        process.exit();
      }
      if(!config.security.currentPersonHref){ configParamNotSet('security.currentPersonHref')  }
      if(typeof config.security.currentPersonHref != 'function'){
        console.error('[audit/broadcast - configuration] security.currentPersonHref has to be a function!');
        process.exit();
      }
    }

    //Load configuration
    var app = config.app;
    var srv = config.server;
    var pg = config.pg;

    var io = require('socket.io').listen(srv, {log: false}); // using "old" socket.io because socket.io 1.0 seems to have a long connection setup on heroku with lots of probe packets

    var redis = require('redis');
    var RedisStore = require('socket.io/lib/stores/redis');
    var redisURL = url.parse(process.env.REDIS_URL);

    var security = require('./js/security.js')(config);
    var history = require('./js/history.js');
    var versions = require('./js/versions.js');

    var broadcast = function (database, elements) {
      var deferred = Q.defer();
      // TODO: check sri4node: error like invalid element.type is silently thrown away??
      elements.forEach(function(element) {
        var resourceName = '/' + inflect.pluralize(element.body.type.toLowerCase());
        if (resourceName === '/people') {
          // seems we don't use the ordinary plural of person...
          resourceName = '/persons'
        }
        var notificationMsg = {
          current: '/versions/' + element.body.key,
          previous: 'TODO!', //TODO lookup with db query
          timestamp: element.body.timestamp,
          person: element.body.person,
          operation: element.body.operation,
          type: element.body.type,
          permalink: element.body.resource
        };

        console.log('resourceName: ' + resourceName);
        console.log('notificationMsg: ' + JSON.stringify(notificationMsg));
        io.sockets.to(resourceName).emit('update', notificationMsg);
        io.sockets.to(element.body.resource).emit('update', notificationMsg);
      });

      deferred.resolve();
      return deferred.promise;
    };

    app.get('/history', history.setFixedOrderForHistoryAndCheckSomeCustomPrerequisites);

    sri4node.configure(app, pg, {
      logrequests: true,
      logsql: false,
      logdebug: false,
      authenticate: config.authenticate,
      identify: config.identify,
      defaultdatabaseurl: config.databaseUrl,
      resources: [
        {
          type: '/versions',
          cache: {
            ttl: 120,
            type: 'redis',
            redis: process.env.REDIS_URL
          },
          methods: [
            'GET',
            'PUT'
          ],
          public: false,
          schema: {
            $schema: 'http://json-schema.org/schema#',
            title: 'A regular resource that contains a specific version of a resource in the API.',
            type: 'object',
            properties: {
              key: $s.guid(''),
              timestamp: $s.timestamp('A timestamp when the update occurred. This timestamp is generated on '
                + 'the client that performs a PUT to /version/{guid}.'),
              person: $s.string('A permalink to the person that made the modification.'),
              //TODO: can we use $s.permalink?
              component: $s.string('A permalink to the /security/component that manages this resource.'),
              operation: {
                description: 'Opperation that has been performed on the resource',
                enum: ['CREATE', 'UPDATE', 'DELETE', 'INITIALIZE']
              },
              type: $s.string('The $$meta.type of the original resource.'),
              resource: $s.string('Permalink of the resource'),
              document: {
                type: 'object',
                description: 'The full resource as it was in this version, at the given timestamp.'
              }
            },
            required: [
              'key',
              'timestamp',
              'person',
              'component',
              'operation',
              'type',
              'resource',
              'document'
            ]
          },
          validate: [versions.notSameVersion],
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
            document: {oninsert: versions.mapInsertDocument}
          },
          afterread: [security.doSecurityCheckGet],
          afterupdate: [versions.onlyAllowInsertNoUpdate],
          afterinsert: [security.doSecurityCheckPut, broadcast],
          afterdelete: []
        },
        {
          type: '/history',
          table: 'versions',
          cache: {
            ttl: 120,
            type: 'redis',
            redis: process.env.REDIS_URL
          },
          methods: ['GET'],
          public: false,
          secure: [security.checkAccessOnResource],
          schema: {
            $schema: 'http://json-schema.org/schema#',
            title: 'A special resource that presents the history a resource in the API.',
            type: 'object',
            properties: {
              timestamp: $s.timestamp('A timestamp when the update occurred.'),
              person: $s.string('A permalink to the person that made the modification.'),
              operation: {
                description: 'Opperation that has been performed on the resource',
                enum: ['CREATE', 'UPDATE', 'DELETE', 'INITIALIZE']
              },
              resource: $s.string('Permalink of the resource'),
              from: $s.string('A permalink to the previous version (if existing).'),
              to: $s.string('A permalink to the current version.'),
              patch: {
                type: 'object',
                description: 'A JSON patch (rfc6902) between this and previous verion. Only present for UPDATE operations.'
              }
            },
            required: []
          },
          validate: [],
          query: {
            from: history.orderFilter('from'),
            tokey: history.orderFilter('to'),
            resources: history.resourcesFilter,
            defaultFilter: $q.defaultFilter
          },
          map: {
            key: {},
            timestamp: {},
            person: {},
            operation: {},
            resource: {},
            document: {}
          },
          handlelistqueryresult: history.handleHistoryListQueryResult,
          afterread: [],
          afterupdate: [],
          afterinsert: [],
          afterdelete: []
        }
      ]
    });

    var pub = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase
    var sub = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase
    var client = redis.createClient(redisURL.port, redisURL.hostname, {return_buffers: true}); // eslint-disable-line camelcase

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

    app.get('/updates', config.authenticate, function (req, res) {
      var forwardProto = req.get('X-Forwarded-Proto');
      res.send({href: (forwardProto ? forwardProto : req.protocol) + '://' + req.headers.host});
    });

    app.get('/rooms', function (req, res) { // authentication.isAuthenticated
      res.send({rooms: Object.keys(io.sockets.adapter.rooms)});
    });

    app.get('/msg', function (req, res) {
      io.sockets.to('/schools').emit('update', 'FOOBAR!');
      res.send('DONE.');
    });

    app.use('/test', config.express.static(__dirname + '/test/test.html'));

    io.sockets.on('connection', function (socket) {
      console.log('[audit/broadcast - socket] Received Connection: ' + JSON.stringify(socket));
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