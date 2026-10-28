pm.test('Preview accepts the complete v1 sample', () => pm.response.to.have.status(200));
pm.test('Counts exclude the essay from automatic scoring', () => {
  const result = pm.response.json();
  pm.expect(result.questionCount).to.equal(5);
  pm.expect(result.automaticCount).to.equal(4);
  pm.expect(result.essayCount).to.equal(1);
  pm.expect(result.maxScore).to.equal(6);
});
pm.test('Preview does not reveal answer keys', () => {
  pm.expect(pm.response.text()).not.to.match(/correctOptionId|acceptedAnswers|modelAnswer|explanation/);
});
