var session;

function mockPromise(resolveWith, rejectWith) {
  return new Ember.RSVP.Promise(function(resolve, reject) {
    if (!Ember.isEmpty(resolveWith) && !!resolveWith) {
      resolve(resolveWith);
    } else {
      reject(rejectWith);
    }
  });
}

var storeMock;
var StoreMock = Ember.SimpleAuth.Stores.Ephemeral.extend({
  restore: function() {
    this.restoreInvoked = true;
    return this._super();
  }
});

var authenticatorMock;
var AuthenticatorMock = Ember.Object.extend(Ember.Evented, {
  restore: function(content) {
    return mockPromise(AuthenticatorMock._resolve);
  },
  authenticate: function(properties) {
    this.authenticateInvoked     = true;
    this.authenticateInvokedWith = properties;
    return mockPromise(AuthenticatorMock._resolve, AuthenticatorMock._reject);
  },
  invalidate: function(properties) {
    this.invalidateInvoked     = true;
    this.invalidateInvokedWith = properties;
    return mockPromise(AuthenticatorMock._resolve);
  }
});

module('Ember.SimpleAuth.Session', {
  setup: function() {
    window.AuthenticatorMock = AuthenticatorMock;
    authenticatorMock        = AuthenticatorMock.create();
    storeMock                = StoreMock.create();
    Ember.run(function() {
      session = Ember.SimpleAuth.Session.create({ authenticator: authenticatorMock, store: storeMock });
    });
  },
  teardown: function() {
    delete window.AuthenticatorMock;
    delete window.Authenticators;
  }
});

test('is not authenticated when just created', function() {
  session = Ember.SimpleAuth.Session.create({ store: storeMock });

  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when just created.');
});

test('restores its state during initialization', function() {
  storeMock.persist({ authenticator: 'AuthenticatorMock' });
  AuthenticatorMock._resolve = { some: 'content' };
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock });
  });

  ok(storeMock.restoreInvoked, 'Ember.Session restores its content from the store during initialization.');
  ok(session.get('authenticator') instanceof AuthenticatorMock, 'Ember.Session restores the authenticator as a new instance of the class read from the store during initialization.');
  ok(session.get('isAuthenticated'), 'Ember.Session is authenticated when the restored authenticator resolves during initialization.');
  deepEqual(session.get('content'), { some: 'content' }, 'Ember.Session sets its content when the restored authenticator resolves during initialization.');

  AuthenticatorMock._resolve = false;
  storeMock.persist({ key1: 'value1', key2: 'value2' });
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock });
  });

  equal(session.get('authenticator'), null, 'Ember.Session does not assign the authenticator during initialization when the authenticator rejects.');
  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated when the restored authenticator rejects during initialization.');
  equal(session.get('content'), null, 'Ember.Session does not set its content when the restored authenticator rejects during initialization.');
  equal(storeMock.restore().key1, null, 'Ember.Session clears the store when the restored authenticator rejects during initialization.');
  equal(storeMock.restore().key2, null, 'Ember.Session clears the store when the restored authenticator rejects during initialization.');
});

test('authenticates itself with an authenticator', function() {
  var resolved;
  AuthenticatorMock._resolve = { key: 'value' };
  Ember.run(function() {
    session.authenticate(authenticatorMock).then(function() {
      resolved = true;
    });
  });

  ok(authenticatorMock.authenticateInvoked, 'Ember.Session authenticates with the passed authenticator on setup.');
  ok(session.get('isAuthenticated'), 'Ember.Session is authenticated after setup when the authenticator resolves.');
  equal(session.get('key'), 'value', 'Ember.Session sets all properties that the authenticator resolves with during setup.');
  equal(session.get('authenticator'), authenticatorMock, 'Ember.Session saves the authenticator during setup when the authenticator resolves.');
  ok(resolved, 'Ember.Session returns a resolving promise on setup when the authenticator resolves.');

  var rejected;
  var rejectedWith;
  AuthenticatorMock._resolve = false;
  AuthenticatorMock._reject = { error: 'message' };
  Ember.run(function() {
    session = Ember.SimpleAuth.Session.create({ store: storeMock });
    session.authenticate(authenticatorMock).then(function() {}, function(error) {
      rejected     = true;
      rejectedWith = error;
    });
  });

  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated after setup when the authenticator rejects.');
  equal(session.get('authenticator'), null, 'Ember.Session does not save the authenticator during setup when the authenticator rejects.');
  ok(rejected, 'Ember.Session returns a rejecting promise on setup when the authenticator rejects.');
  deepEqual(rejectedWith, { error: 'message'}, 'Ember.Session returns a promise that rejects with the error from the authenticator on setup when the authenticator rejects.');
});

test('invalidates itself', function() {
  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.authenticate(authenticatorMock);
  });
  AuthenticatorMock._resolve = false;
  AuthenticatorMock._reject = { error: 'message' };
  session.set('isAuthenticated', true);
  Ember.run(function() {
    session.invalidate();
  });

  ok(session.get('isAuthenticated'), 'Ember.Session remains authenticated after unauthentication when the authenticator rejects.');
  equal(session.get('authenticator'), authenticatorMock, 'Ember.Session does not unset the authenticator after unauthentication when the authenticator rejects.');

  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.set('content', { key: 'value' });
    session.invalidate();
  });

  ok(authenticatorMock.invalidateInvoked, 'Ember.Session invalidates with the authenticator on invalidation.');
  deepEqual(authenticatorMock.invalidateInvokedWith, { key: 'value' }, 'Ember.Session passes its content to the authenticator on invalidation.');
  ok(!session.get('isAuthenticated'), 'Ember.Session is not authenticated after unauthentication when the authenticator resolves.');
  equal(session.get('aurhenticator'), null, 'Ember.Session unsets the authenticator after unauthentication when the authenticator resolves.');
  equal(session.get('content'), null, 'Ember.Session unsets its content object after unauthentication when the authenticator resolves.');

  Ember.run(function() {
    authenticatorMock.trigger('ember-simple-auth:session-updated', { key: 'other value' });
  });

  equal(session.get('key'), null, 'Ember.Session stops listening to the "updated_session_data" of the authenticator after unauthentication when the authenticator resolves.');
});

test('observes changes of the observer', function() {
  window.Authenticators                        = Ember.Namespace.create();
  window.Authenticators.OtherAuthenticatorMock = AuthenticatorMock.extend();
  var otherAuthenticatorMock                   = window.Authenticators.OtherAuthenticatorMock.create();
  AuthenticatorMock._resolve = true;
  Ember.run(function() {
    session.authenticate(otherAuthenticatorMock).then(function() {
      otherAuthenticatorMock.trigger('ember-simple-auth:session-updated', { key: 'value' });
    });
  });

  equal(session.get('key'), 'value', 'Ember.Session subscribes to the "updated_session_data" of the authenticator when it is assigned.');
  equal(storeMock.restore().authenticator, 'Authenticators.OtherAuthenticatorMock', "Ember.Session saves the authenticator's prototype to the store when it is assigned.");
});
