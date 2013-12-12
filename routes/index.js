var async = require('async');
var http = require('request');
var json2csv = require('json2csv');
var cookie = require('express/node_modules/cookie');
var connect = require('express/node_modules/connect');

function newOAuth(base_uri, access_token) {
  return {
    get : function(path, callback) {
      http.get({
        url : base_uri + path, 
        headers : { 'Authorization' : 'Bearer ' + access_token },
        json : true
      }, callback);
    }
  };
}

function forEachProfile(oauth, callback, then) {
  oauth.get('/user/', function (e, r, body) {
    if (r.statusCode == 200) {
      for (var i = 0; i < body.profiles.length; ++i) {
        if (body.profiles[i].genotyped) {
          callback(body.profiles[i].id);
        }
      }
    }
    then();
  });
}

function newTask(oauth, profile_id, path, fields) {
  return function(callback) {
    oauth.get('/' + path + '/' + profile_id, function (e, r, body) {
      if (body.traits) {
      	for (var i = 0; i < body.traits.length; i++) {
      		body.traits[i].profile_id = profile_id;
      	}
      	json2csv({ data : body.traits, fields : fields }, function(e, csv) {
      		callback(e, { path : path, data : csv });
      	});
      }
   });
  };
}

exports.index = function(request, response, scope) {

	var access_token = request.signedCookies.access_token;

	if (!access_token) {
    response.render('index', {
      client_id : process.env.CLIENT_ID,
      scope : scope,
      redirect_uri : process.env.REDIRECT_URI
    });
    return;
  }

  var oauth = newOAuth('https://api.23andme.com/1', access_token);
  var tasks = [];

  forEachProfile(oauth, function(profile_id) {
    tasks.push(newTask(oauth, profile_id, 'risks', [ 'profile_id', 'report_id', 'description', 'population_risk', 'risk' ]));
    tasks.push(newTask(oauth, profile_id, 'carriers', [ 'profile_id', 'report_id', 'description', 'mutations' ]));
    tasks.push(newTask(oauth, profile_id, 'drug_responses', [ 'profile_id', 'report_id', 'description', 'status' ]));
    tasks.push(newTask(oauth, profile_id, 'traits', [ 'profile_id', 'report_id', 'trait' ]));
  },function() {
  	async.series(tasks, function(e, csv) {
  		response.clearCookie('access_token');
  		if (csv && csv.length) {
  			response.set('Content-Type', 'text/plain');
  			response.set('Content-Disposition', 'attachment; filename=analyses.csv');
  			for (var i = 0; i < csv.length; ++i) {
  				response.write(csv[i].path + "\n");
  				response.write(csv[i].data + "\n\n");
  			}
    		response.end();
  		} else {
        response.render('error');
  		}
  	});
  });
};

exports.receive_code = function(request, response, scope) {

  if (!request.query.code) {
    response.render('error');
    return;
  }

  http.post({
    url : 'https://api.23andme.com/token/',
    form : {
      client_id : process.env.CLIENT_ID,
      client_secret : process.env.CLIENT_SECRET,
      grant_type : 'authorization_code',
      code: request.query.code,
      redirect_uri : process.env.REDIRECT_URI,
      scope : scope
    }, json : true }, function(e, r, body) {
    if (!e && r.statusCode == 200) {
      response.cookie('access_token', body.access_token, { signed : true });
      response.redirect('/');
    } else {
      response.render('error');
    }
  });
};
