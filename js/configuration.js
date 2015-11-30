/**
 * Created by rodrigouroz on 17/02/14.
 */
'use strict';
var fs, configurationFile;
configurationFile = './environment.generated/configuration.json';
fs = require('fs');
var configuration = JSON.parse(fs.readFileSync(configurationFile));
var config = {
  getValue: function (key) {
    if (configuration[key]) {
      return configuration[key];
    }
    return null;
  }
};
module.exports = config;
