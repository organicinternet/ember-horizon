import Ember from 'ember';
import Adapter from 'ember-data/adapter';
import RealTimeAdapter from '../mixins/real-time-adapter';
import logger from '../utils/logger'; // jshint ignore:line

const { RSVP: {Promise}, debug, get, inject: {service}, typeOf, assert } = Ember;

/**
 * @class HorizonFetchAdapter
 * 
 * This adapter integrates with a Horizon/RethinkDB stack; it provides
 * normal CRUD operations by default and can provide real-time updates
 * if the application chooses to use the services "watch" services for one,
 * many, or all collections.
 */
export default Adapter.extend(RealTimeAdapter, {
  horizon: service(),
  defaultSerializer: '-horizon',

  findRecord(store, typeClass, id) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      type: typeClass,
      model: typeClass.modelName,
      id
    };

    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.find)
        .then(horizon.fetch)
        .then(s => resolve(s.payload))
        .catch(reject);

    }); // return promise
  },

  findAll(store, typeClass) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      type: typeClass,
      model: typeClass.modelName,
    };

    return new Promise((resolve, reject) => {

      // Fetch
      horizon.collection(state)
        .then(s => horizon.fetch(s))
        .then(s => resolve(s.payload))
        .then(() => {
          // Where needed, register watcher
          if (this.configuredForWatch(state) && !this.subscriptionActive(state)) {
            state.cb = this.generateHandler(state);
            state.options = {name: 'ember-data-adapter'};
            return horizon.collection(state)
              .then(() => horizon.watch(state))
              .then( s => this.saveSubscription(s) )
              .catch(err => {
                debug(`Problem setting up watch for ${state.model}.`, err);
              });
          } else {
            return Promise.resolve();
          }
        })
        .catch(err => {
          console.error(`problems running findAll('${state.model}'): `, err);
          reject(err);
        });

    }); // return promise
  },

  findMany(store, typeClass, ids) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      type: typeClass,
      model: typeClass.modelName,
      ids: ids
    };
    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.findMany)
        .then(horizon.fetch)
        .then(s => resolve(s.payload))
        .catch(err => {
          assert('Error in executing findMany()', this);
          reject(err);
        });

    }); // return promise
  },

  query(store, typeClass, query) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      type: typeClass,
      model: typeClass.modelName,
      query
    };
    return new Promise((resolve, reject) => {

      if (horizon.isWatching(state.model)) {
        resolve( this.peekAll(state.model, state.query) ); // TODO: this may not work with query
      } else {
        horizon.collection(state)
          .then(horizon.findMany)
          .then(horizon.fetch)
          .then(s => resolve(s.payload))
          .catch(reject);
      }

    }); // return promise
  },

  queryRecord(store, type, query) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      type,
      model: type.modelName,
      query
    };

    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.find)
        .then(horizon.fetch)
        .then(s => resolve(s.payload))
        .catch(reject);

    }); // return promise
  },

  createRecord(store, type, snapshot) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      payload: snapshot.serialize(),
      type,
      model: type.modelName,
      snapshot
    };

    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.store)
        .then(s => resolve(s.payload))
        .catch(reject);

    }); // return promise
  },

  updateRecord(store, type, snapshot) {
    const horizon = get(this, 'horizon');
    const state = {
      store,
      payload: snapshot.serialize({ includeId: true }),
      type,
      model: type.modelName,
      snapshot
    };

    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.replace)
        .then(s => resolve(s.payload))
        .catch(reject);

    }); // return promise
  },

  deleteRecord(store, type, snapshot) {
    const horizon = get(this, 'horizon');
    snapshot = this.serialize(snapshot, { includeId: true });
    const id = typeOf(snapshot) === 'object' ? snapshot.id : snapshot;
    const state = {
      store,
      type,
      model: type.modelName,
      snapshot,
      id: id
    };

    return new Promise((resolve, reject) => {

      horizon.collection(state)
        .then(horizon.remove)
        .then(() => resolve())
        .catch(reject);

    }); // return promise
  },
});
