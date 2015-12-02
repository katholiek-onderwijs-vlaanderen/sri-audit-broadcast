# About
The `sri-audit-broadcast` module gives you a possibility to create an audit trail of all your sri resources. 
It also has a build-in broadcast services that sends out broadcasts when a new version has been created.

# Usage

Here you can find a example `server.js` file:

	//Load all required dependencies.
	var express = require('express');
	var app = express();
	var http = require('http');
	var srv = new http.Server(app);
	var auditBroadcast = require('sri-audit-broadcast');
	
	//Sri4node authentication functions.
	var authentication = require('vsko-authentication')(app);
	authentication.init();
	
	//Functions in order to do security lookup
	var resourceToSecurityComponent = function (resource) {
		return '/security/components/samenscholing-api';
	};
	var meToHref = function (me) {
		return '/persons/' + me.uuid;
	};
	
	//The configuration and initalisation
	auditBroadcast.init({
		app: app,
		server: srv,
		express: express,
		authenticate: authentication.isAuthenticated,
		identify: authentication.getMe,
		security: {
			host: 'http://localhost:8080/api',
			component: resourceToSecurityComponent,
			currentPersonHref: meToHref,
			username: 'myBasicAuthUsername',
			password: 'myBasicAuthPassword',
			headers: {}
		}
	});
	
	//Start the http server
	srv.listen(process.env.PORT || 3000, function(){
		console.log('Node app is running at http://localhost:' + (process.env.PORT || 3000));
	});

# Requirements
* An sri interface
* A running [sri-security-api](https://github.com/rodrigouroz/sri-security-api) to do security 
* You need to use express on node.js
* postgress 9.4
* a reddis server

# Configuration
## app, server, express
You need to pass these variables because we need to plug in our resources into your application.

## authenticate
Is a sri4node function you can find the documentation [here](https://github.com/dimitrydhondt/sri4node#authenticate)

## identify
Is a sri4node function you can find the documentation [here](https://github.com/dimitrydhondt/sri4node#identify)

## security
We also need to set some variables in order to connect to the security api

#### host
Where is the security api located.

#### component
This function has to return a component href to check the rights of this component. It receives these parameter :

* `resource` a href to the resource for which a version has been created.

#### currentPersonHref
This function has to return a person href to check if this person has rights to the contents of a version. It receives these parameter :

* `me` the result of the identify function.

#### username & password (optional)
If the access to the security api requires basic authentication you can specify the credentials.

#### headers (optional)
If the access to the security api requires you to have custom headers set you can add these.

# Test broadcast
You can test the broadcast api by going to: [http://localhost:3000/test](http://localhost:3000/test)