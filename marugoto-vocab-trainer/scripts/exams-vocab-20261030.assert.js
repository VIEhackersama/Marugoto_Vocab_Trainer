pm.test('Vocabulary library request succeeds', () => pm.response.to.have.status(200));
const exams = pm.response.json();
pm.test('Only the imported vocabulary exam exists', () => pm.expect(exams).to.have.lengthOf(1));
pm.test('Vocabulary exam has 80 questions and no essay scoring', () => {
  pm.expect(exams[0].questionCount).to.eql(80);
  pm.expect(exams[0].automaticCount).to.eql(80);
  pm.expect(exams[0].essayCount).to.eql(0);
});
pm.test('Vocabulary exam totals 100 points in 75 minutes', () => {
  pm.expect(exams[0].maxScore).to.eql(100);
  pm.expect(exams[0].timeLimitMinutes).to.eql(75);
});
pm.test('Library response does not disclose answer keys', () => {
  pm.expect(JSON.stringify(exams)).not.to.match(/correctOptionId|acceptedAnswers|explanation/);
});
