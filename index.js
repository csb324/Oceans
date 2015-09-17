var _ = require('underscore');
_.mixin( require('underscore.deferred') );

var rita = require('rita');
var Twit = require('twit');
var T = new Twit(require('./config.js'));
var wordfilter = require('wordfilter');
var ent = require('ent');
var rest = require('node-restclient');
var wordnikKey = require('./permissions.js').key;
var corpora = require('corpora-project');


var rg = rita.RiGrammar();



Array.prototype.pick = function() {
  return this[Math.floor(Math.random()*this.length)];
};

Array.prototype.pickRemove = function() {
  var index = Math.floor(Math.random()*this.length);
  return this.splice(index,1)[0];
};


var getAdjsURL =  "http://api.wordnik.com/v4/words.json/randomWords?" +
                  "hasDictionaryDef=true&includePartOfSpeech=adjective&limit=2&" +
                  "minCorpusCount=100&api_key=" + wordnikKey;


function getNouns() {
  var d = new _.Deferred();

  var nounsUrl = "http://api.wordnik.com/v4/words.json/randomWords?" +
    "minCorpusCount=1000&minDictionaryCount=20&" +
    "excludePartOfSpeech=proper-noun,proper-noun-plural,proper-noun-posessive,suffix,family-name,idiom,affix&" +
    "hasDictionaryDef=true&includePartOfSpeech=noun&limit=10&maxLength=12&" +
    "api_key=" + wordnikKey;
  var nouns = []

  rest.get(nounsUrl, function(data) {
    for (var i = 0; i < data.length; i++) {
      nouns.push(data[i].word);
    };
    d.resolve(nouns);
  }, "json");

  return d.promise();
};

function getAdjectives() {
  var d = new _.Deferred();

  var adjectivesUrl = "http://api.wordnik.com/v4/words.json/randomWords?" +
    "hasDictionaryDef=true&includePartOfSpeech=adjective&limit=2&" +
    "minCorpusCount=100&api_key=" + wordnikKey;

  var adjectives = []

  rest.get(adjectivesUrl, function(data) {
    for (var i = 0; i < data.length; i++) {
      adjectives.push(data[i].word);
    };
    d.resolve(adjectives);
  }, "json");

  return d.promise();
};

function getSuperlatives() {
  var dfd = new _.Deferred();
  dfd.resolve("slimiest");
  return dfd.promise();
}

function getObjects() {
  var objects = corpora.getFile("objects", "objects")["objects"];
  var singleWord = objects.filter(function(element) {
    var words = element.split(" ");
    return (words.length == 1);
  });

  var singularWord = singleWord.map(function(index, elem) {
    return rita.RiTa.singularize(index);
  });
  return singularWord;
}

function getBodyParts() {
  var objects = corpora.getFile("humans", "bodyParts")["bodyParts"];
  var pluralized = objects.map(function(index, elem) {
    return rita.RiTa.pluralize(index);
  });

  var nonHumanBodyParts = [
    "exoskeletons",
    "shells",
    "valves",
    "penises",
    "retinas",
    "skeletons",
    "bristles",
    "tentacles"
  ];


  return pluralized.concat(nonHumanBodyParts);
}

function generate() {
  var dfd = new _.Deferred();
  _.when(
    getNouns(),
    getSuperlatives(),
    getObjects(),
    getAdjectives(),
    getBodyParts()

  ).done(function(nouns, superlatives, objects, adjectives, bodyParts) {
    var rules = {
      "<start>": [
          "The <fish> only has one known predator: the <fish>",
          "You've never seen anything <verb> like the <fish>.",
          "The <fish> has <adjective> <bodyparts>"
        ],

      "<fish>": ["<noun> <fishtype> [4]", "sea <object>"],
      "<fishtype>": ["fish [4]", "ray", "toad", "squid", "shark", "eel", "lobster", "worm"],
      "<noun>": nouns,
      "<object>": objects,
      "<adjective>": adjectives,
      "<bodyparts>": bodyParts,
      "<verb>": "be a fish"
    };

    rg.load(rules);
    dfd.resolve(rg.expand());
  });

  return dfd.promise();
}


function tweet() {
  generate().then(function(myTweet) {
    if (!wordfilter.blacklisted(myTweet)) {
      console.log(myTweet);
    }
  });
}

function search(term) {
  console.log('searching',term);
  var dfd = new _.Deferred();
  T.get('search/tweets', { q: term, count: 100 }, function(err, reply) {
    console.log('search error:',err);
    var tweets = reply.statuses;
    tweets = _.chain(tweets)
      // decode weird characters
      .map(function(el) {
        if (el.retweeted_status) {
          return ent.decode(el.retweeted_status.text);
        }
        else {
          return ent.decode(el.text);
        }
      })
      .reject(function(el) {
        // throw out quotes and links and replies
        return el.indexOf('http') > -1 || el.indexOf('@') > -1 || el.indexOf('"') > -1;
      })
      .uniq()
      .value();
    dfd.resolve(tweets);
  });
  return dfd.promise();
}

// Tweet every 60 minutes
setInterval(function () {
  try {
    tweet();
  }
  catch (e) {
    console.log(e);
  }
}, 1000 * 60 * 60);

// Tweet once on initialization
for (var i = 0; i < 30; i++) {
  tweet();
};

