document.addEventListener('DOMContentLoaded', () => {
    let allQuestions = [];
    let activeQuestions = [];
    let currentIndex = 0;
    let isWrongMode = false;
    let selectedOptions = new Set();

    // DOM Elements
    const questionIdEl = document.getElementById('question-id');
    const questionTextEl = document.getElementById('question-text');
    const optionsContainerEl = document.getElementById('options-container');
    const feedbackContainerEl = document.getElementById('feedback-container');
    const feedbackTextEl = document.getElementById('feedback-text');
    const explanationTextEl = document.getElementById('explanation-text');
    const progressTextEl = document.getElementById('progress-text');
    const progressFillEl = document.getElementById('progress-fill');
    const statsTextEl = document.getElementById('stats-text');

    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const showAnswerBtn = document.getElementById('show-answer-btn');
    const jumpInput = document.getElementById('jump-input');
    const jumpBtn = document.getElementById('jump-btn');
    const wrongToggleBtn = document.getElementById('wrong-toggle-btn');

    const STORAGE_KEYS = {
        indexAll: 'aws-ai-quiz-index',
        indexWrong: 'aws-ai-quiz-index-wrong',
        wrongIds: 'aws-ai-quiz-wrong-ids',
        stats: 'aws-ai-quiz-stats',
        mode: 'aws-ai-quiz-mode'
    };

    // Load Questions
    fetch('questions.json')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
            }
            return response.json();
        })
        .then(data => {
            if (!Array.isArray(data)) {
                throw new Error('题库格式错误：期望为数组');
            }
            allQuestions = data;

            const savedMode = localStorage.getItem(STORAGE_KEYS.mode);
            isWrongMode = savedMode === 'wrong';
            applyMode(isWrongMode);
        })
        .catch(err => {
            const isFileProtocol = typeof window !== 'undefined' && window.location && window.location.protocol === 'file:';
            if (isFileProtocol) {
                questionTextEl.innerHTML = '题库加载失败：你正在用 file:// 方式打开页面，浏览器会禁止读取 questions.json。<br><br>请用本地服务器打开（例如 VS Code Live Server，或命令行运行 python -m http.server），再访问 http://localhost:8000/ 。';
            } else {
                questionTextEl.textContent = `题库加载失败：${err?.message || err}`;
            }
            console.error('Error:', err);
        });

    function initQuiz() {
        updateStatsText();
        updateProgress();
        renderQuestion();
        updateControls();
    }

    function renderQuestion() {
        const q = activeQuestions[currentIndex];

        // Reset state
        feedbackContainerEl.classList.add('hidden');
        optionsContainerEl.innerHTML = '';
        selectedOptions.clear();

        if (!q) {
            questionIdEl.textContent = isWrongMode ? '错题模式' : '刷题模式';
            questionTextEl.textContent = isWrongMode ? '暂无错题，先去做几题吧。' : '没有可用题目。';
            explanationTextEl.textContent = '';
            return;
        }

        // Set Question Info
        questionIdEl.textContent = `Question #${q.id}`;
        questionTextEl.innerHTML = formatText(q.question);
        
        // Render Options
        // Sort keys to ensure order A, B, C...
        const keys = Object.keys(q.options).sort();
        
        keys.forEach(key => {
            const optionEl = document.createElement('div');
            optionEl.classList.add('option');
            optionEl.dataset.key = key;
            
            const labelEl = document.createElement('span');
            labelEl.classList.add('option-label');
            labelEl.textContent = `${key}.`;
            
            const textEl = document.createElement('div');
            textEl.innerHTML = formatText(q.options[key]); // Format options too
            
            optionEl.appendChild(labelEl);
            optionEl.appendChild(textEl);
            
            optionEl.addEventListener('click', () => handleOptionClick(key, q));

            optionsContainerEl.appendChild(optionEl);
        });

        // Add Submit button for multi-select
        if (q.answer.length > 1) {
            const submitBtn = document.createElement('button');
            submitBtn.textContent = '确认提交 (多选)';
            submitBtn.className = 'btn primary full-width mt-1';
            submitBtn.id = 'submit-multi-btn';
            submitBtn.addEventListener('click', () => handleSubmitMulti(q));
            optionsContainerEl.appendChild(submitBtn);
        }
        
        // Update explanation content but keep hidden
        explanationTextEl.innerHTML = formatText(q.explanation || "No explanation available.");
    }
    
    function formatText(text) {
        if (!text) return '';
        const lines = text.split('\n');
        let formatted = '';
        
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue; // Skip empty lines
            
            if (formatted === '') {
                formatted += line;
            } else {
                const lastChar = formatted[formatted.length - 1];
                // Check if the previous block ended with punctuation
                // If so, it's likely a paragraph break
                const isPunctuation = /[.!?。？！：:]/.test(lastChar);
                
                if (isPunctuation) {
                    formatted += '<br><br>' + line;
                } else {
                    // Otherwise it's likely a hard wrap in the middle of a sentence
                    formatted += ' ' + line;
                }
            }
        }
        return formatted;
    }

    function handleOptionClick(selectedKey, q) {
        // If already answered/shown, do nothing
        if (!feedbackContainerEl.classList.contains('hidden')) return;

        if (q.answer.length === 1) {
            // Single choice - existing logic
            const isCorrect = selectedKey === q.answer;
            recordAttempt(isCorrect);
            if (!isCorrect) addWrongQuestionId(q.id);
            updateStatsText();
            revealAnswer(selectedKey, q.answer);
        } else {
            // Multi choice - toggle selection
            const optionEl = optionsContainerEl.querySelector(`.option[data-key="${selectedKey}"]`);
            if (selectedOptions.has(selectedKey)) {
                selectedOptions.delete(selectedKey);
                optionEl.classList.remove('selected');
            } else {
                selectedOptions.add(selectedKey);
                optionEl.classList.add('selected');
            }
        }
    }

    function handleSubmitMulti(q) {
        if (selectedOptions.size === 0) {
            alert('请至少选择一个选项');
            return;
        }
        if (!feedbackContainerEl.classList.contains('hidden')) return;

        const selectedStr = Array.from(selectedOptions).sort().join('');
        const correctStr = q.answer.split('').sort().join('');
        const isCorrect = selectedStr === correctStr;

        recordAttempt(isCorrect);
        if (!isCorrect) addWrongQuestionId(q.id);
        updateStatsText();
        revealAnswer(Array.from(selectedOptions), q.answer);
    }
    
    function revealAnswer(selectedKey, correctKey) {
        const options = optionsContainerEl.querySelectorAll('.option');
        const correctKeys = correctKey.split('');
        const selectedKeys = Array.isArray(selectedKey) ? selectedKey : (selectedKey ? [selectedKey] : []);
        
        options.forEach(opt => {
            const key = opt.dataset.key;
            
            // Remove previous classes
            opt.classList.remove('selected', 'correct', 'wrong');
            
            if (correctKeys.includes(key)) {
                opt.classList.add('correct');
            }
            
            if (selectedKeys.includes(key)) {
                if (!correctKeys.includes(key)) {
                    opt.classList.add('wrong');
                } else {
                    opt.classList.add('selected'); // Highlight user choice if correct
                }
            }
        });
        
        feedbackContainerEl.classList.remove('hidden');

        // Hide multi-submit button if it exists
        const submitBtn = document.getElementById('submit-multi-btn');
        if (submitBtn) submitBtn.style.display = 'none';

        if (selectedKeys.length > 0) {
            const selectedStr = selectedKeys.sort().join('');
            const correctStr = correctKeys.sort().join('');
            
            if (selectedStr === correctStr) {
                 feedbackTextEl.textContent = "Correct! ✅";
                 feedbackTextEl.style.color = "var(--correct-color)";
            } else {
                 feedbackTextEl.textContent = `Incorrect. The correct answer is ${correctKey}. ❌`;
                 feedbackTextEl.style.color = "var(--wrong-color)";
            }
        } else {
            feedbackTextEl.textContent = `The correct answer is ${correctKey}.`;
            feedbackTextEl.style.color = "var(--primary-color)";
        }
    }
    
    function updateProgress() {
        const total = activeQuestions.length;
        const current = total === 0 ? 0 : (currentIndex + 1);
        progressTextEl.textContent = isWrongMode
            ? `错题 ${current} / ${total}`
            : `题目 ${current} / ${total}`;
        const percentage = total === 0 ? 0 : (current / total) * 100;
        progressFillEl.style.width = `${percentage}%`;

        // Save progress
        localStorage.setItem(isWrongMode ? STORAGE_KEYS.indexWrong : STORAGE_KEYS.indexAll, currentIndex);
    }

    function updateControls() {
        const total = activeQuestions.length;
        const hasQuestions = total > 0;
        prevBtn.disabled = !hasQuestions || currentIndex === 0;
        nextBtn.disabled = !hasQuestions || currentIndex === total - 1;
        showAnswerBtn.disabled = !hasQuestions;
        jumpBtn.disabled = !hasQuestions;
        jumpInput.disabled = !hasQuestions;
    }

    function loadWrongQuestionIds() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.wrongIds);
            const arr = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(arr)) return new Set();
            return new Set(arr.map(x => String(x)));
        } catch {
            return new Set();
        }
    }

    function saveWrongQuestionIds(wrongIdSet) {
        localStorage.setItem(STORAGE_KEYS.wrongIds, JSON.stringify(Array.from(wrongIdSet)));
    }

    function addWrongQuestionId(questionId) {
        const wrongIdSet = loadWrongQuestionIds();
        wrongIdSet.add(String(questionId));
        saveWrongQuestionIds(wrongIdSet);
    }

    function getWrongQuestions() {
        const wrongIdSet = loadWrongQuestionIds();
        return allQuestions.filter(q => wrongIdSet.has(String(q.id)));
    }

    function loadStats() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.stats);
            const data = raw ? JSON.parse(raw) : null;
            const total = Number(data?.total) || 0;
            const correct = Number(data?.correct) || 0;
            return { total, correct };
        } catch {
            return { total: 0, correct: 0 };
        }
    }

    function saveStats(stats) {
        localStorage.setItem(STORAGE_KEYS.stats, JSON.stringify(stats));
    }

    function recordAttempt(isCorrect) {
        const stats = loadStats();
        stats.total += 1;
        if (isCorrect) stats.correct += 1;
        saveStats(stats);
    }

    function updateStatsText() {
        if (!statsTextEl) return;
        const stats = loadStats();
        const wrongCount = loadWrongQuestionIds().size;
        const accuracy = stats.total === 0 ? '--' : `${((stats.correct / stats.total) * 100).toFixed(1)}%`;
        statsTextEl.textContent = `正确率：${accuracy}（${stats.correct}/${stats.total}）｜错题：${wrongCount}`;
    }

    function applyMode(wrongMode) {
        isWrongMode = wrongMode;
        localStorage.setItem(STORAGE_KEYS.mode, isWrongMode ? 'wrong' : 'all');

        activeQuestions = isWrongMode ? getWrongQuestions() : allQuestions;

        const savedIndexRaw = localStorage.getItem(isWrongMode ? STORAGE_KEYS.indexWrong : STORAGE_KEYS.indexAll);
        const savedIndex = savedIndexRaw && !isNaN(savedIndexRaw) ? parseInt(savedIndexRaw) : 0;
        currentIndex = Number.isFinite(savedIndex) ? savedIndex : 0;
        if (currentIndex < 0) currentIndex = 0;
        if (currentIndex >= activeQuestions.length) currentIndex = 0;

        wrongToggleBtn.textContent = isWrongMode ? '返回全部题' : '查看错题';
        initQuiz();
    }

    // Event Listeners
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            initQuiz();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentIndex < activeQuestions.length - 1) {
            currentIndex++;
            initQuiz();
        }
    });

    showAnswerBtn.addEventListener('click', () => {
        const q = activeQuestions[currentIndex];
        if (q) revealAnswer(null, q.answer);
    });

    jumpBtn.addEventListener('click', () => {
        const val = parseInt(jumpInput.value);
        if (val >= 1 && val <= activeQuestions.length) {
            currentIndex = val - 1; // 0-indexed
            initQuiz();
        } else {
            alert(`请输入 1 到 ${activeQuestions.length} 之间的数字`);
        }
    });

    wrongToggleBtn.addEventListener('click', () => {
        if (!isWrongMode) {
            const wrongQuestions = getWrongQuestions();
            if (wrongQuestions.length === 0) {
                alert('暂无错题。做错题目后这里会自动收录。');
                return;
            }
        }
        applyMode(!isWrongMode);
    });
});
