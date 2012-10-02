var fs = require('fs'),
    path = require('path'),
    http = require('http'),
    jsdom = require('jsdom'),
    _  = require('underscore'),
    express = require('express'),
    request = require('request'),
    twitter = require('ntwitter'),
    socketio = require('socket.io'),
    unshorten = require('unshorten'),
    dateformat = require('dateformat'),
    querystring = require('querystring');

var config = getConfig();
var latest = [];

function main() {
  var sockets = [];

  var app = express();
  var server = http.createServer(app);
  var io = socketio.listen(server);

  app.configure(function() {
    app.use(express.static(__dirname + '/public'));
  });

  // heroku specific configuration
  io.configure('production', function() {
    io.set("transports", ["xhr-polling"]);
    io.set("polling duration", 10);
  });

  io.sockets.on('connection', function(socket) {
    // don't send all of the latest tweets it can cause a lag
    _.each(latest.slice(-10), function(t) {socket.emit('tweet', t);});
    sockets.push(socket);
    socket.on('disconnect', function() {
      sockets = _.without(sockets, socket);
    });
  });

  var tweets = new twitter(getConfig());
  tweets.stream('statuses/filter', {track: '#toronto'}, function(stream) {
    stream.on('data', function(t) {
      console.log(t)
      tweet(t, sockets);
    });
    stream.on('error', function(err, code) {
      console.log('uhoh got a twitter stream error: ' + err + ' ; ' + code);
    });
    stream.on('limit', function(l) {
      console.log('whoops. we got limited by twitter: ' + l);
    });
  });

  server.listen(process.env.PORT || config.port || 3000);
}

function getConfig() {
  // looks in a json file or the environment for some config info
  try {
    var configPath = path.join(__dirname, "config.json");
    return JSON.parse(fs.readFileSync(configPath));
  } catch(err) {
    var config = {
      consumer_key: process.env.TWITTER_CONSUMER_KEY,
      consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
      access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
      access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
      ia_bucket: process.env.IA_BUCKET,
      ia_access_key: process.env.IA_ACCESS_KEY,
      ia_secret_key: process.env.IA_SECRET_KEY,
    }
    console.log(config);
    return config;
  }
}

function tweet(t, sockets) {
  var tweetUrl = "http://twitter.com/" + t.user.screen_name + "/statuses/" + t.id_str;
  var msg = {
    "id": t.id_str,
    "url": tweetUrl,
    "text": t.text,
    "user": t.user.screen_name,
    "name": t.user.name,
    "avatar": t.user.profile_image_url,
    "created": t.created_at,
    "tweet": t,
  };
  addLatest(msg);
  _.each(sockets, function(socket) {
  socket.emit('tweet', msg);
  });
}

function addLatest(msg) {
  latest.push(msg);
}

function archive() {
  var now = new Date();
  if (archving && now - archiving < 62 * 1000) {
    console.log("looks like an archive is underway");
    return;
  }

  archiving = now;
  var name = "/" + dateformat(now, 'yyyymmddhhmmss') + '.json';
  var value = JSON.stringify(latest, null, 2);
  latest = [];

  var c = ia.createClient({
    accessKey: config.ia_access_key,
    sercretKey: config_ia_secret_key,
    bucket: config.ia_bucket
  });
  c.addObject({name: name, value: value}, function() {
    console.log("archived " + name);
  });
}

if (! module.parent) {
  main();
}

