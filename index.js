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

function getPresentVerbs() {
  return riLexRequest('vbz');
}

function getGerunds() {
  return riLexRequest('vbg');
}

function getSuperlatives() {
  return riLexRequest('jjs');
};

function getComparatives() {
  return riLexRequest('jjr');
};

function getBaseVerbs() {
  return riLexRequest('vb');
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

function pluralize(array) {
  return array.map(function(index, elem) {
    if (index.charAt(index.length - 1) == "s") {
      return index;
    }else{
      return ritaCore.pluralize(index);
    };
  });
}

function generate() {
  var dfd = new _.Deferred();

  _.when(
    getNouns(),
    getSuperlatives(),
    getObjects(),
    getAdjectives(),
    getComparatives(),
    getBodyParts(),
    getPresentVerbs(),
    getBaseVerbs(),
    getGerunds()

  ).done(function(
    nouns,
    superlatives,
    objects,
    adjectives,
    comparatives,
    bodyParts,
    presentVerbs,
    baseVerbs,
    gerunds
  ) {

    var animals = corpora.getFile("animals", "common")["animals"];
    var countries = corpora.getFile("geography", "countries")["countries"];
    var menuItems = corpora.getFile("foods", "menuItems")["menuItems"];
    var moods = corpora.getFile("humans", "moods")["moods"];

    var rules = {

      "<start>": ["<fact> [10]", "<fact> #<hashtag> [2]", "DID YOU KNOW: <fact>"],
      "<fact>": [
          "<theFish> only has one known predator: <det> <fish>.",
          "<theFish> <verbs> by <verbing> its <bodypart>.",
          "<theFish> uses its <adjective> <bodypart> to <fishyPhrase>",
          "<theFish> has <adjective> <bodyparts>.",
          "<theFish> is <number> times <comparativeAdj> than a <objectOrAnimal>, and <number> times <comparativeAdj>.",
          "The moment they are born, the <fish> can already <verb> more than most <animals>.",

          "<theFish> is the <superlative> creature known to man.",

          "<theFish> is known for its <number> <adjective> <bodyparts>.",
          "The <fish> is <adjective>, but it is said to taste like <menuItem>.",

          "<theFish> <alwaysNever> <verbs>.",
          "<theFish> <alwaysNever> <modal> to <fishyPhrase>.",

          "The <fish> looks like a <broadObject> crossed with a <broadObject>.",
          "If you visit <country>, make sure to look for the world's <superlative> animal: The <fish>.",

          "<theFish> <being> <comparativePhrase>",

          "<menuItem> makes up almost <number> percent of the <fish>'s diet.",
        ],

      "<theFish>": [
        "Because of its <adjective> <bodypart>, the <fish>",
        "The <fish> [5]",
        "In <country>, the <fish>",
        "In order to <fishyPhrase>, the <fish>",
        "Studies <showing> that the <fish>",
        "Next time you feel <mood>, remember that the <fish>",
      ],

      "<fish>": ["<noun> <fishtype> [4]", "<sea> <object>", "<sea> <animal>", "<adjective> <fish>"],
      "<sea>": ["sea", "deep-sea", "underwater"],
      "<fishtype>": ["fish [4]", "ray", "toad", "squid", "shark", "eel", "lobster", "worm"],
      "<fishyPhrase>": "<fishyVerb> <fishyObject>",
      "<fishyVerb>": ["protect", "defend", "return to", "devour", "digest", "blend in with", "attract", "seduce", "hide from", "identify", "detect", "escape", "call out to", "sing to", "sneak up on"],
      "<fishyObject>": ["its habitat", "its home", "its next meal", "its prey", "its eggs", "its mate", "itself", "its food", "its surroundings", "predators", "its young"],

      "<noun>": nouns,
      "<object>": objects,
      "<animal>": animals,
      "<animals>": pluralize(animals),
      "<menuItem>": menuItems,
      "<country>": countries,
      "<broadObject>": ["<menuItem>", "<object>", "<adjective> <object>"],
      "<objectOrAnimal>": ["<object>", "<animal>"],

      "<bodypart>": bodyParts,
      "<bodyparts>": pluralize(bodyParts),

      "<alwaysNever>": ["always", "never", "almost always", "almost never"],

      "<comp>": ["as", "more", "less"],
      "<adjectiveEr>": comparatives,
      "<comparativeAdj>": ["<adjectiveEr>", "<comp> <adjective>"],
      "<comparativePhrase>": [
        "<number> times <comparativeAdj> than <det> <objectOrAnimal>",
        "<comparativeAdj> than <det> <objectOrAnimal>",
        "<comparativeAdj> than most <animals>"
      ],

      "<det>": ["a", "the", "your average", "the average", "the <superlative>", "a <adjective>"],

      "<superlative>": superlatives,
      "<adjective>": adjectives,
      "<mood>": moods,

      "<verbs>": presentVerbs,
      "<verb>": baseVerbs,
      "<verbing>": gerunds,
      "<being>": ["is", "could be", "might be", "cannot be", "was once", "evolved to be"],
      "<showing>": ["show", "suggest", "prove", "indicate"],
      "<modal>": ["has", "gets", "needs"],

      "<number>": ["three", "four", "five", "six", "seven", "eight", "nine", "ten", "200", "300", "50", "100,000", "several thousand"],
      "<hashtag>": ["oceanfacts", "cool", "wow", "amazing", "ocean", "weirdocean", "incredible", "fact", "incredible", "nature", "facts", "realfacts", "omg"]
    };

    rg.load(rules);
    dfd.resolve(rg);
  });
  return dfd.promise();
}


function tweet() {
  generate().then(function(rg) {

    var myTweet = rg.expand();
    if (!wordfilter.blacklisted(myTweet)) {
      console.log(myTweet);
    };

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

