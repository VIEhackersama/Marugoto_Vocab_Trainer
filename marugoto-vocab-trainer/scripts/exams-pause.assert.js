pm.test('Paused attempt is returned successfully', () => pm.response.to.have.status(200));
pm.test('Paused timer has a frozen budget and no active deadline', () => {
  const a = pm.response.json();
  pm.expect(a.status).to.equal('PAUSED');
  pm.expect(a.remainingMs).to.be.a('number').and.above(0);
  pm.expect(a).not.to.have.property('deadlineAt');
  pm.expect(a.pausedAt).to.be.a('number');
});
pm.test('Paused attempt retains answers and position without revealing the answer key', () => {
  const a = pm.response.json();
  pm.expect(Object.keys(a.answers).length).to.be.above(0);
  pm.expect(a.currentQuestionId).to.be.a('string');
  pm.expect(JSON.stringify(a.document)).not.to.match(/correctOptionId|acceptedAnswers|modelAnswer|explanation/);
});
