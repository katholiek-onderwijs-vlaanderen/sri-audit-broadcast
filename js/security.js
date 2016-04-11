/**
 * Created by guntherclaes on 04/04/16.
 */
var needleRetry = require('needle-retry');
var Q = require('q');
var config;

function consultSecurityApi (me, deferred, resourceList, ability) {

  if (!config.security.enabled){
    deferred.resolve();
  }else{
    console.log('security check');
    var batchSecurity = [];
    var failed, j;

    resourceList.forEach(function (resource) {
      var securityUrl = '/security/query/allowed?ability=' + ability + '&component=' + config.security.component(resource) + '&person=' + config.security.currentPersonHref(me);
      if(ability !== 'create'){
        securityUrl = securityUrl + '&resource=' + resource;
      }
      batchSecurity.push({
        href: securityUrl,
        verb: 'GET'
      });
    });

    console.log('batchSecurity:' + batchSecurity);

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
        console.log('security error : ' + err);
        console.log('security error response: ' + response);
        deferred.reject(err);
      } else {
        failed = [];
        if (response.statusCode === 200) {
          console.log('BODY: ' + response.body);
          for (j = 0; j < response.body.length; j ++) {
            if (response.body[j].status !== 200 || ! response.body[j].body) {
              failed.push(response.body[j].href);
            }
          }
          if (failed.length === 0) {
            deferred.resolve();
          } else {
            console.log('Security request(s) not allowed:' + failed);
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
};

module.exports = function (passedConfig) {
  config = passedConfig;
  return {
    checkAccessOnResource: function (req, resp, db, me) {
      console.log("check access on resource");
      var deferred = Q.defer();
      // Only GET requests with specific resource specified can be checked in pre-process secure function,
      // others can only be checked in post-processing.
      if (req.query.resource) {
        consultSecurityApi(me, deferred, req.query.resource.split(','), 'read');
      } else if (req.query.resources) {
        consultSecurityApi(me, deferred, req.query.resources.split(','), 'read');
      } else {
        deferred.resolve();
      }
      return deferred.promise;
    },
    doSecurityCheckGet: function (database, elements, me){
      var deferred = Q.defer();
      consultSecurityApi(me, deferred, elements.map(function (e) {
        return e.resource;
      }), 'read');
      return deferred.promise;
    },
    doSecurityCheckPut: function (database, elements, me){
      var deferred = Q.defer();
      consultSecurityApi(me, deferred, ['/versions'], 'create');
      return deferred.promise;
    }
  };
};