var async = require('async');
var request = require('request');
var json2csv = require('json2csv');

exports.index = function(req, res, scope){
    if (req.signedCookies.access_token) {
        var user_id, profiles = [];
        var base_uri = 'https://api.23andme.com/1';
        var headers = {Authorization: 'Bearer ' + req.signedCookies.access_token};
        request.get({ url: base_uri + '/user/', headers: headers, json: true }, function (e, r, body) {
            if(r.statusCode != 200) {
                res.clearCookie('access_token');
                res.redirect('/');
            } else {
            		var tasks = [];
            	  user_id = body.id;
                for (var i = 0; i < body.profiles.length; i++) {
                	if (body.profiles[i].genotyped) {
                		var profile_id = body.profiles[i].id;

                		tasks.push(function(callback) {
                			request.get({ url: base_uri + '/risks/' + profile_id + '/', headers: headers, json: true}, function (e, r, b) {
                				for (var j = 0; j < b.traits.length; j++) {
                					b.traits[j].profile_id = profile_id;
                				}
                				json2csv({data: b.traits, fields: ['profile_id', 'report_id', 'description', 'population_risk', 'risk']}, function(err, csv) {
                					callback(null, { type : 'risks', data : csv });
                				});
                			});
                		});

                		tasks.push(function(callback) {
                			request.get({ url: base_uri + '/carriers/' + profile_id + '/', headers: headers, json: true}, function (e, r, b) {
                				for (var j = 0; j < b.traits.length; j++) {
                					b.traits[j].profile_id = profile_id;
                				}
                				json2csv({data: b.traits, fields: ['profile_id', 'report_id', 'description', 'mutations']}, function(err, csv) {
                					callback(null, { type : 'carriers', data : csv });
                				});
                			});
                		});

                		tasks.push(function(callback) {
                			request.get({ url: base_uri + '/drug_responses/' + profile_id + '/', headers: headers, json: true}, function (e, r, b) {
                				for (var j = 0; j < b.traits.length; j++) {
                					b.traits[j].profile_id = profile_id;
                				}
                				json2csv({data: b.traits, fields: ['profile_id', 'report_id', 'description', 'status']}, function(err, csv) {
                					callback(null, { type : 'drug_responses', data : csv });
                				});
                			});
                		});

                		tasks.push(function(callback) {
                			request.get({ url: base_uri + '/traits/' + profile_id + '/', headers: headers, json: true}, function (e, r, b) {
                				console.log(b)
                				for (var j = 0; j < b.traits.length; j++) {
                					b.traits[j].profile_id = profile_id;
                				}
                				json2csv({data: b.traits, fields: ['profile_id', 'report_id', 'trait']}, function(err, csv) {
                					callback(null, { type : 'traits', data : csv });
                				});
                			});
                		});
                		
                  } 
                }
                async.series(tasks, function(type, csv) {
          				res.set('Content-Type', 'text/plain');
                	for (var i = 0; i < csv.length; i++) {
                		res.write(csv[i].type + "\n");
                		res.write(csv[i].data + "\n");
                	}
                	res.end();
                });
            }
        });
    } else {
        res.render('index', {
            client_id: process.env.CLIENT_ID,
            scope: scope,
            redirect_uri: process.env.REDIRECT_URI
        });
    }
};

exports.receive_code = function(req, res, scope){
    if (!req.query.code) {
        res.render('error', {
            client_id: process.env.CLIENT_ID,
            scope: scope,
            redirect_uri: process.env.REDIRECT_URI
        });
    } else {
        // Exchange the code for a token,
        // store it in the session, and redirect.
        request.post({
            url: 'https://api.23andme.com/token/',
            form: {
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: req.query.code,
                redirect_uri: process.env.REDIRECT_URI,
                scope: scope
            },
            json: true }, function(e, r, body) {
                if (!e && r.statusCode == 200) {
                    res.cookie('access_token', body.access_token, {signed: true});
                    res.redirect('/');
                } else {
                    res.send(body);
                }
            });
    }
};
