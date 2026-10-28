pm.test('Resumed attempt is returned successfully', () => pm.response.to.have.status(200));
pm.test('Resume sets a future server deadline and clears paused fields', () => {
  const a = pm.response.json();
  pm.expect(a.status).to.equal('IN_PROGRESS');
  pm.expect(a.deadlineAt).to.be.above(a.serverNow);
  pm.expect(a).not.to.have.property('remainingMs');
  pm.expect(a).not.to.have.property('pausedAt');
});
pm.test('Resume retains answers and current question', () => {
  const a = pm.response.json();
  pm.expect(Object.keys(a.answers).length).to.be.above(0);
  pm.expect(a.currentQuestionId).to.be.a('string');
});
