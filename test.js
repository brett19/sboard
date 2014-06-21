var snmp = require('snmp-native');
var ping = require('pinger');
var request = require('request');
var express = require('express');
var parseXml = require('xml2js').parseString;

var sess = new snmp.Session({ host: '192.168.7.1', community: 'public' });



function showInfo(done) {
  request('http://192.168.7.10/tvr/data.xml', function (error, response, body) {
    if (!body) {
      return done(new Error('bad data'), null);
    }

    parseXml(body, function (err, result) {
      if (err) {
        return done(new Error('bad xml'), null);
      }

      var showData = [];

      var startDate = new Date();
      startDate.setTime(startDate.getTime() + (2*60*60*1000));

      var items = result.WhenToWatch.item;
      items.reverse();
      for (var i = 0; i < items.length; ++i) {
        var item = items[i];
        var firstAired = new Date(item.FirstAired[0]);

        if (firstAired > startDate) {
          continue;
        }

        showData.push({
          showName: item.SeriesName[0],
          seasNum: parseInt(item.SeasonNumber[0]),
          epiNum: parseInt(item.EpisodeNumber[0]),
          epiKey: 'S' + item.SeasonNumber[0] + 'E' + item.EpisodeNumber[0],
          epiName: item.EpisodeName[0],
          dled: item.available ? (item.available[0]=='true') : false,
          airDate: firstAired
        });

        if (showData.length >= 20) {
          break;
        }
      }

      done(null, showData);
    });
  });
}

var inSpeeds = [];
var outSpeeds = [];
var pings = [];

for (var i = 0; i < 30; ++i) {
  inSpeeds.push(-1);
  outSpeeds.push(-1);
  pings.push(-1);
}

var uSpdSec = 2;

function updatePing() {
  ping("google.ca", function(err, ms) {
    if (err) {
      ms = -1;
    }
    pings.unshift(ms);
    pings.pop();
  });
}
updatePing();
setInterval(updatePing, uSpdSec*5000);


var lastInVal = -1;
var lastOutVal = -1;
function updateSpeeds() {
  sess.getAll({ oids: ['.1.3.6.1.2.1.2.2.1.10.9', '.1.3.6.1.2.1.2.2.1.16.9'] }, function(err, bnds) {
    if (!err) {
      var inOcts = bnds[0].value * 8; // throughput in mbps
      var outOcts = bnds[1].value * 8; // throughput in mbps

      if (lastInVal >= 0 && lastOutVal >= 0) {
        var deltaIn = inOcts - lastInVal;
        var deltaOut = outOcts - lastOutVal;

        inSpeeds.unshift(deltaIn/uSpdSec);
        inSpeeds.pop();
        outSpeeds.unshift(deltaOut/uSpdSec);
        outSpeeds.pop();
      }
      lastInVal = inOcts;
      lastOutVal = outOcts;
    }
  });
}
updateSpeeds();
setInterval(updateSpeeds, uSpdSec*1000);



var app = express();

app.use('/', express.static(__dirname + '/public'));

app.get('/showdata', function(req, res){
  showInfo(function(err, data) {
    res.send(data);
  })
});

app.get('/netdata', function(req, res){
  res.send({
    pings: pings,
    upS: inSpeeds,
    downS: outSpeeds
  });
});

var server = app.listen(9000, function() {
  console.log('Listening on port %d', server.address().port);
});
