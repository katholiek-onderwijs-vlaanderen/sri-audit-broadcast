/**
 * Created by guntherclaes on 01/12/15.
 */

var inflect = require('i')();
var jiff = require('jiff');

var pg = require('pg');
var sri4node = require('sri4node');
var $u = sri4node.utils;
var $s = sri4node.schemaUtils;
var $q = sri4node.queryUtils;
var url = require('url');
var Q = require('q');

var needleRetry = require('needle-retry');

module.exports = {

  init: function (config) {

    //Check configuration
    var configParamNotSet = function (param){
      console.log('ERROR: ' + param + ' parameter is not set. Check your configuration!');
      process.exit();
    }

    if(!config.app){ configParamNotSet('app')  }
    if(!config.server){ configParamNotSet('server')  }
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
        console.log('ERROR: security.component has to be a function!');
        process.exit();
      }
      if(!config.security.currentPersonHref){ configParamNotSet('security.currentPersonHref')  }
      if(typeof config.security.currentPersonHref != 'function'){
        console.log('ERROR: security.currentPersonHref has to be a function!');
        process.exit();
      }
    }

    var app = config.app;
    var srv = config.server;

    // using "old" socket.io because socket.io 1.0 seems to have a long connection setup
    // on heroku with lots of probe packets
    var io = require('socket.io').listen(srv, {log: false});
    var redis = require('redis');
    var RedisStore = require('socket.io/lib/stores/redis');

    function consultSecurityApi (me, deferred, resourceList) {
      if (!config.security.enabled){
        deferred.resolve();
      }else{
        var batchSecurity = [];
        var failed, j;
        resourceList.forEach(function (resource) {
          var securityUrl = '/security/query/allowed?ability=read' + '&component=' + config.security.component(resource)
            + '&person=' + config.security.currentPersonHref(me) + '&resource=' + resource;
          batchSecurity.push({
            href: securityUrl,
            verb: 'GET'
          });
        });
        console.log('batchSecurity:', batchSecurity);
        var reqOptions = {needle: {json: true}};
        if(config.security.username && config.security.password) {
          reqOptions.needle.username = config.security.username;
          reqOptions.needle.password = config.security.password;
        }

        if(config.security.headers) {
          reqOptions.needle.headers = config.security.headers
        }

        needleRetry.request('PUT', config.security.host + '/security/query/batch', batchSecurity, reqOptions, function (err, response) {
          if (err) {
            console.log('security error : ', err);
            console.log('security error response: ', response);
            deferred.reject(err);
          } else {
            failed = [];
            if (response.statusCode === 200) {
              console.log('BODY: ', response.body);
              for (j = 0; j < response.body.length; j ++) {
                if (response.body[j].status !== 200 || ! response.body[j].body) {
                  failed.push(response.body[j].href);
                }
              }
              if (failed.length === 0) {
                deferred.resolve();
              } else {
                console.log('Security request(s) not allowed:', failed);
                deferred.reject({
                  statusCode: 403,
                  body: {}
                });
              }
            } else {
              console.log('Received status ' + response.statusCode + ' -> reject.');
              deferred.reject();
            }
          }
        });
      }
    }

    function checkAccessOnResource (req, resp, db, me) {
      var deferred = Q.defer();
      // Only GET requests with specific resource specified can be checked in pre-process secure function,
      // others can only be checked in post-processing.
      if (req.query.resource) {
        consultSecurityApi(me, deferred, req.query.resource.split(','));
      } else if (req.query.resources) {
        consultSecurityApi(me, deferred, req.query.resources.split(','));
      } else {
        deferred.resolve();
      }
      return deferred.promise;
    }

    var doSecurityCheckGet = function (database, elements, me) {
      var deferred = Q.defer();
      consultSecurityApi(me, deferred, elements.map(function (e) {
        return e.resource;
      }));
      return deferred.promise;
    };

var doSecurityCheckPut = function (database, elements, me) {
  var deferred = Q.defer();
  consultSecurityApi(me, deferred, elements.map(function (e) {
    return e.body.resource;
  }));
  return deferred.promise;
};

    function handleGenericResponse (resp, obj) {
      resp.status(obj.status).send(obj);
    }

    var setFixedOrderForHistoryAndCheckSomeCustomPrerequisites = function (req, resp, next) {
      if (req.path.split('/')[2]) {
        handleGenericResponse(resp, $u.generateError(//(status, type, errors) {
          404, 'no.list.resource.request', 'This resource can only be retrieved as list resource.'));
      } else if (! req.query.resource && !req.query.resources) {
        handleGenericResponse(resp, $u.generateError(404,
          'resource.parameter.mandatory', '\'resource\' is a mandatory search parameter.'));
      } else if (req.query.orderBy || req.query.descending) {
        handleGenericResponse(resp, $u.generateError(404,
          'orderby.and.descending.parameters.not.allowed',
          'Parameters orderby and descending not allowed on this resource.'));
      } else {
        req.query.orderBy = 'timestamp';
        req.query.descending = 'true';
        next();
      }
    };

    var onlyAllowInsertNoUpdate = function () {
      var deferred = Q.defer();
      deferred.reject({
        statusCode: 409,
        body: {
          code: 'existing.version.cannot.be.updated',
          message: 'Existing versions cannot be updated. A new version should be created.'
        }
      });
      return deferred.promise;
    };

    var addPrevAndNextLinksToJson = function (database, elements) {
      return Q.all(elements.map(function (element) {
        var deferred = Q.defer();
        var query = $u.prepareSQL('key');
        query.sql('select next, previous from versions_previous_next_view where key = ').param(element.key);
        $u.executeSQL(database, query).then(function (result) {
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
    };

    var removeDollarDollarFieldsFromJSON = function (json) {
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

    var mapInsertDocument = function (key, element) {
      removeDollarDollarFieldsFromJSON(element);
      return element;
    };

    var parsePermalink = function (permalink) {
      var deferred = Q.defer();
      var ret, key, splitted;
      // TODO: check on only  letters in type en only hex in key !
      ret = {};
      console.log(permalink);
      console.log(typeof permalink);
      if (typeof permalink === 'string') {
        splitted = permalink.split('/');
        if (splitted.length === 3) {
          ret.resourcetype = inflect.singularize(splitted[1]).toUpperCase();
          key = splitted[2];
          if (key.length === 36) {
            ret.key = key;
            deferred.resolve(ret);
          } else {
            deferred.reject({
              code: 'parameter.invalid.resource.uuid',
              value: key
            });
          }
        } else {
          deferred.reject({
            code: 'parameter.invalid.value',
            value: permalink
          });
        }
      } else {
        deferred.reject({
          code: 'parameter.invalid.value',
          value: permalink
        });
      }
      return deferred.promise;
    };

    var orderFilter = function (direction) {
      return function (value, select) {
        var deferred = Q.defer();
        var operator;
        if (value) {
          if (Array.isArray(value)) {
            //TODO: adapr to work in sri4node
            deferred.reject({
              code: 'only.one.value.allowed',
              parameter: direction
            });
          } else {
            if (direction === 'from') {
              operator = '<=';
            } else {
              operator = '>=';
            }
            parsePermalink(value).then(function (result) {
              select.sql(' AND timestamp ' + operator
                + ' (select timestamp from versions where key=\'' + result.key + '\')');
              deferred.resolve();
            });
          }
        } else {
          deferred.resolve();
        }
        return deferred.promise;
      };
    };

    var resourcesFilter = function (value, select) {
      var deferred = Q.defer();
      var permalinks;
      if (value) {
        permalinks = value.split(',');

        select.sql(' and resource in (').array(permalinks).sql(') ');
        deferred.resolve();
      } else {
        deferred.reject();
      }
      return deferred.promise;
    };

    var handleHistoryListQueryResult = function (req, result) {
      var deferred = Q.defer();
      var rows;
      rows = result.rows;
      rows.forEach(function (row, index) {
        // take in count that the query could bring different type of resources in the same result ('resources' parameter)
        var sameResourceVersions = rows.slice(index + 1).filter(function(version) {
          return version.resource === row.resource;
        });
        var fromVersion = sameResourceVersions.length > 0 ? sameResourceVersions[0] : null;
        if (fromVersion) {
          row.from = '/versions/' + fromVersion.key;
        }
        row.to = '/versions/' + row.key;
        //if (operation != 'DELETE') { // TODO: generate decent error message at these kind of errors
        if (row.operation === 'UPDATE') {
          row.patch = jiff.diff(fromVersion ? fromVersion.document : null, row.document);
        }
      });
      rows.forEach(function (row) {
        delete row.key;
        delete row.document;
      });
      deferred.resolve(rows);
      return deferred.promise;
    };

var broadcast = function (database, elements) {
  var deferred = Q.defer();
  // TODO: alter in such way that audit function always stores result even if broadcast fails !
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

    console.log('resourceName: ', resourceName);
    console.log('notificationMsg: ', notificationMsg);
    io.sockets.to(resourceName).emit('update', notificationMsg);
    io.sockets.to(element.body.resource).emit('update', notificationMsg);
  });

  deferred.resolve();
  return deferred.promise;
};

    sri4node.configure(app, pg, {
      logrequests: true,
      logsql: false,
      logdebug: false,
      authenticate: config.authenticate,
      identify: config.identify,
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
          secure: [checkAccessOnResource],
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
              operation: $s.string('CREATE, UPDATE or DELETE'),
              // should be enum
              type: $s.string('The $$meta.type of the original resource.'),
              //resource_key : $s.guid("Key of the resource, use in case of DELETE operation instead of document"),
              resource: $s.string('Permalink of the resource'),
              document: {
                // should be valid json!
                type: 'object',
                description: 'The full resource as it was in this version, at the given timestamp.'
              }  // $s.string("The full resource as it was in this version, at the given timestamp.")
            },
            required: [
              'key',
              'timestamp',
              'person',
              'component',
              'operation',
              'type',
              'resource'
            ]  //TODO: verify if document is present in each PUT, otherwise send 409
          },
          validate: [],
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
            document: {oninsert: mapInsertDocument}
          },
          // After read, update, insert or delete
          // you can perform extra actions.
          afterread: [doSecurityCheckGet, addPrevAndNextLinksToJson],
          afterupdate: [onlyAllowInsertNoUpdate],
          afterinsert: [doSecurityCheckPut, broadcast],
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
          secure: [checkAccessOnResource],
          schema: {
            $schema: 'http://json-schema.org/schema#',
            title: 'A special resource that presents the history a resource in the API.',
            type: 'object',
            properties: {
              timestamp: $s.timestamp('A timestamp when the update occurred.'),
              person: $s.string('A permalink to the person that made the modification.'),
              operation: $s.string('CREATE, UPDATE or DELETE'),
              // should be enum
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
            from: orderFilter('from'),
            tokey: orderFilter('to'),
            resources: resourcesFilter,
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
          handlelistqueryresult: handleHistoryListQueryResult,
          afterread: [],
          afterupdate: [],
          afterinsert: [],
          afterdelete: []
        }
      ]
    });


app.get('/history', setFixedOrderForHistoryAndCheckSomeCustomPrerequisites);

var redisURL = url.parse(process.env.REDIS_URL);

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

    app.get('/history', setFixedOrderForHistoryAndCheckSomeCustomPrerequisites);

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
      console.log('\n\n *** RECEIVED CONNECTION: ' + socket + ' ***\n\n');
      socket.on('join', function (roomName) {
        console.log('*** JOINING ROOM: ' + roomName + ' ***');
        socket.join(roomName);
      });
      socket.on('leave', function (roomName) {
        console.log('*** LEAVING ROOM: ' + roomName + ' ***');
        socket.leave(roomName);
      });
    });

  }

};