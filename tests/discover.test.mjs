import assert from 'node:assert/strict';
import test from 'node:test';
import {suggest} from '../discover.js';

test('Une ville précise et deux envies filtrent les activités', () => {
  const [idea, ...others] = suggest({destination:'kyoto', themes:['nature','repas'], days:2});
  assert.equal(idea.city,'Kyoto');
  assert.deepEqual(idea.matches.map(activity=>activity.theme),['nature','repas']);
  assert.deepEqual(idea.plan,idea.matches);
  assert.equal(others.length,0);
});

test('La région et la durée s’appliquent aux séjours, avec des idées complémentaires', () => {
  const ideas = suggest({destination:'Europe',themes:['repas'],days:4});
  assert.equal(ideas.length,3);
  for(const idea of ideas) {
    assert.equal(idea.duration,4);
    assert.equal(idea.plan[0].theme,'repas');
    assert.equal(new Set(idea.plan.map(activity=>activity.id)).size,4);
  }
  assert.deepEqual(suggest({destination:'absente'}),[]);
});
