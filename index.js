var _ = require('underscore');
_.mixin( require('underscore.deferred') );

var rita = require('rita');
var ritaCore = rita.RiTa;
var Twit = require('twit');
var T = new Twit(require('./config.js'));
var wordfilter = require('wordfilter');
var ent = require('ent');
var rest = require('node-restclient');
var wordnikKey = require('./permissions.js').key;
var corpora = require('corpora-project');


var rg = rita.RiGrammar();
var lex = rita.RiLexicon();


Array.prototype.pick = function() {
  return this[Math.floor(Math.random()*this.length)];
};

Array.prototype.pickRemove = function() {
  var index = Math.floor(Math.random()*this.length);
  return this.splice(index,1)[0];
};

function getCanonicals(array) {
  var canonicals = array.map(function(index) {
    url = "http://api.wordnik.com/v4/word.json/"
      + index
      + "?useCanonical=true&includeSuggestions=false&api_key="
      + wordnikKey;

    rest.get(url, function(data) {
      console.log(data);
      if (data["word"]) {
        return data["word"];
      } else {
        return index;
      }
    }, "json");
  });

  return canonicals;
}

function wordnikRequest(partOfSpeech) {
  var d = new _.Deferred();
  var url;
  if (partOfSpeech == "noun") {
    url = "http://api.wordnik.com/v4/words.json/randomWords?" +
      "minCorpusCount=1000&minDictionaryCount=20&" +
      "excludePartOfSpeech=proper-noun,proper-noun-plural,proper-noun-posessive,suffix,family-name,idiom,affix&" +
      "hasDictionaryDef=true&includePartOfSpeech=noun&limit=10&maxLength=12&" +
      "api_key=" + wordnikKey;
  } else {
    url = "http://api.wordnik.com/v4/words.json/randomWords?" +
      "hasDictionaryDef=true&includePartOfSpeech=" + partOfSpeech + "&limit=10&" +
      "minCorpusCount=100&minDictionaryCount=1&api_key=" + wordnikKey;
  }

  var results = []
  rest.get(url, function(data) {
    for (var i = 0; i < data.length; i++) {
      results.push(data[i].word);
    };
    d.resolve(results);
  }, "json");

  return d.promise();
}

function riLexRequest(partOfSpeech) {
  var words = [];
  for (var i = 0; i < 10; i++) {
    words.push(lex.randomWord(partOfSpeech));
  };
  return words;
}

function getNouns() {
  return wordnikRequest("noun");
};

function getAdjectives() {
  return wordnikRequest("adjective");
};

// function getIntVerbs() {
//   return wordnikRequest("verb-intransitive");
// };

function getPresentVerbs() {
  return riLexRequest('vbz');
}

function getGerunds() {
  return riLexRequest('vbg');
}

function getSuperlatives() {
  var superlatives = [];
  for (var i = 0; i < 10; i++) {
    superlatives.push(lex.randomWord('jjs'));
  };
  return superlatives;
};

function getObjects() {
  var objects = corpora.getFile("objects", "objects")["objects"];
  var singleWord = objects.filter(function(element) {
    var words = element.split(" ");
    return (words.length == 1);
  });

  var singularWord = singleWord.map(function(index, elem) {
    return ritaCore.singularize(index);
  });
  return singularWord;
}

function getBodyParts() {
  var objects = corpora.getFile("humans", "bodyParts")["bodyParts"];
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

  return objects.concat(nonHumanBodyParts);
}

function generate() {
  var dfd = new _.Deferred();
  var present = {
    tense: ritaCore.PRESENT_TENSE,
    number: ritaCore.SINGULAR,
    person: ritaCore.THIRD_PERSON
  };

  _.when(
    getNouns(),
    getSuperlatives(),
    getObjects(),
    getAdjectives(),
    getBodyParts(),
    getPresentVerbs(),
    getGerunds()
  ).done(function(
      nouns,
      superlatives,
      objects,
      adjectives,
      bodyParts,
      presentVerbs,
      gerunds)
    {

    var rules = {
      "<start>": [
          "The <fish> only has one known predator: the <fish>.",
          "The <fish> <verbs> by <verbing> its <bodyparts>.",
          "The <fish> has <adjective> <bodyparts>."
        ],

      "<fish>": ["<noun> <fishtype> [5]", "sea <object>"],
      "<fishtype>": ["fish [4]", "ray", "toad", "squid", "shark", "eel", "lobster", "worm"],
      "<noun>": nouns,
      "<object>": objects,
      "<adjective>": adjectives,
      "<bodyparts>": bodyParts,
      "<verbs>": presentVerbs,
      "<verbing>": gerunds
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

// // Tweet once on initialization
for (var i = 0; i < 30; i++) {
  tweet();
};

