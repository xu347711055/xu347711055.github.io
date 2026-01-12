const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'questions.json');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let fixedCount = 0;

data.forEach(q => {
    if (Array.isArray(q.answer)) return;
    if (q.type === 'match' || q.type === 'order') return;
    const explanation = q.explanation || '';
    // Look for patterns like "正确答案：\nBC" or "正确答案：\n B C" or "正确答案：BC"
    const match = explanation.match(/正确答案：\s*([\n\s]*[A-Z]{1,5})/);
    if (match) {
        const realAnswer = match[1].replace(/[\n\s]/g, '').trim();
        if (realAnswer && realAnswer !== q.answer) {
            console.log(`Fixing ID ${q.id}: ${q.answer} -> ${realAnswer}`);
            q.answer = realAnswer;
            fixedCount++;
        }
    }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log(`Done! Fixed ${fixedCount} questions.`);
