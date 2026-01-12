document.addEventListener('DOMContentLoaded', () => {
    let allQuestions = [];
    let activeQuestions = [];
    let currentIndex = 0;
    let isWrongMode = false;
    let selectedOptions = new Set();
    let currentHotspotState = null;

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
    const manualWrongContainerEl = document.getElementById('manual-wrong-container');
    const manualWrongInputEl = document.getElementById('manual-wrong-input');
    const manualWrongBtnEl = document.getElementById('manual-wrong-btn');

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
            allQuestions = data
                .slice()
                .sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));

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
        updateManualWrongControls();
    }

    function renderQuestion() {
        const q = activeQuestions[currentIndex];

        // Reset state
        feedbackContainerEl.classList.add('hidden');
        optionsContainerEl.innerHTML = '';
        selectedOptions.clear();
        currentHotspotState = null;

        if (!q) {
            questionIdEl.textContent = isWrongMode ? '错题模式' : '刷题模式';
            questionTextEl.textContent = isWrongMode ? '暂无错题，先去做几题吧。' : '没有可用题目。';
            explanationTextEl.textContent = '';
            return;
        }

        // Set Question Info
        questionIdEl.textContent = `Question #${q.id}`;
        questionTextEl.innerHTML = formatText(q.question);

        const questionType = getQuestionType(q);
        if (questionType === 'match') {
            renderMatchQuestion(q);
        } else if (questionType === 'order') {
            renderOrderQuestion(q);
        } else {
            renderMultipleChoiceQuestion(q);
        }
        
        // Update explanation content but keep hidden
        explanationTextEl.innerHTML = formatText(q.explanation || "No explanation available.");
    }

    function getQuestionType(q) {
        if (!q) return 'mcq';
        if (q.type === 'match' || (Array.isArray(q.prompts) && Array.isArray(q.choices))) return 'match';
        if (q.type === 'order' || Array.isArray(q.items)) return 'order';
        return 'mcq';
    }

    function renderMultipleChoiceQuestion(q) {
        if (!q?.options || typeof q.options !== 'object') {
            const msg = document.createElement('div');
            msg.textContent = '题目数据缺少选项（options），无法渲染。';
            optionsContainerEl.appendChild(msg);
            return;
        }

        const answerKey = typeof q.answer === 'string' ? q.answer : '';

        const keys = Object.keys(q.options).sort();
        keys.forEach(key => {
            const optionEl = document.createElement('div');
            optionEl.classList.add('option');
            optionEl.dataset.key = key;

            const labelEl = document.createElement('span');
            labelEl.classList.add('option-label');
            labelEl.textContent = `${key}.`;

            const textEl = document.createElement('div');
            textEl.innerHTML = formatText(q.options[key]);

            optionEl.appendChild(labelEl);
            optionEl.appendChild(textEl);

            optionEl.addEventListener('click', () => handleOptionClick(key, q));
            optionsContainerEl.appendChild(optionEl);
        });

        if (answerKey.length > 1) {
            const submitBtn = document.createElement('button');
            submitBtn.textContent = '确认提交 (多选)';
            submitBtn.className = 'btn primary full-width mt-1';
            submitBtn.id = 'submit-multi-btn';
            submitBtn.addEventListener('click', () => handleSubmitMulti(q));
            optionsContainerEl.appendChild(submitBtn);
        }
    }

    function renderMatchQuestion(q) {
        const prompts = Array.isArray(q.prompts) ? q.prompts : [];
        const choices = Array.isArray(q.choices) ? q.choices : [];
        const answer = Array.isArray(q.answer) ? q.answer : [];

        if (prompts.length === 0 || choices.length === 0) {
            const msg = document.createElement('div');
            msg.textContent = '题目数据缺少 prompts/choices，无法渲染。';
            optionsContainerEl.appendChild(msg);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'hotspot-wrapper';

        const rows = [];
        prompts.forEach((prompt, idx) => {
            const row = document.createElement('div');
            row.className = 'hotspot-row';
            row.dataset.index = String(idx);

            const left = document.createElement('div');
            left.className = 'hotspot-left';
            left.innerHTML = formatText(prompt);

            const right = document.createElement('div');
            right.className = 'hotspot-right';

            const select = document.createElement('select');
            select.className = 'hotspot-select';
            select.dataset.index = String(idx);

            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '请选择...';
            select.appendChild(placeholder);

            choices.forEach(choice => {
                const opt = document.createElement('option');
                opt.value = choice;
                opt.textContent = choice;
                select.appendChild(opt);
            });

            right.appendChild(select);
            row.appendChild(left);
            row.appendChild(right);

            wrapper.appendChild(row);
            rows.push(row);
        });

        optionsContainerEl.appendChild(wrapper);

        const submitBtn = document.createElement('button');
        submitBtn.textContent = '提交匹配';
        submitBtn.className = 'btn primary full-width mt-1';
        submitBtn.addEventListener('click', () => {
            if (!feedbackContainerEl.classList.contains('hidden')) return;

            const selects = wrapper.querySelectorAll('select.hotspot-select');
            const userAnswer = Array.from(selects).map(s => s.value);
            if (userAnswer.some(v => !v)) {
                alert('请完成所有匹配后再提交');
                return;
            }

            const isCorrect = userAnswer.length === answer.length && userAnswer.every((v, i) => v === answer[i]);
            recordAttempt(isCorrect);
            if (!isCorrect) addWrongQuestionId(q.id);
            updateStatsText();
            revealMatchAnswer({ wrapper, rows, userAnswer, correctAnswer: answer, userSubmitted: true });
        });
        optionsContainerEl.appendChild(submitBtn);

        currentHotspotState = { type: 'match', wrapper, rows, correctAnswer: answer };
    }

    function revealMatchAnswer({ wrapper, rows, userAnswer, correctAnswer, userSubmitted }) {
        const selects = wrapper.querySelectorAll('select.hotspot-select');
        selects.forEach(s => (s.disabled = true));

        rows.forEach((row, idx) => {
            row.classList.remove('correct', 'wrong');
            const selected = userAnswer?.[idx];
            const correct = correctAnswer?.[idx];
            if (selected && correct && selected === correct) {
                row.classList.add('correct');
            } else {
                row.classList.add('wrong');
            }

            const existing = row.querySelector('.hotspot-correct-text');
            if (existing) existing.remove();
            const correctEl = document.createElement('div');
            correctEl.className = 'hotspot-correct-text';
            correctEl.textContent = `正确：${correctAnswer?.[idx] ?? ''}`;
            row.appendChild(correctEl);
        });

        feedbackContainerEl.classList.remove('hidden');
        if (userSubmitted) {
            const allCorrect = rows.every(r => r.classList.contains('correct'));
            if (allCorrect) {
                feedbackTextEl.textContent = 'Correct! ✅';
                feedbackTextEl.style.color = 'var(--correct-color)';
            } else {
                feedbackTextEl.textContent = 'Incorrect. ❌';
                feedbackTextEl.style.color = 'var(--wrong-color)';
            }
        } else {
            feedbackTextEl.textContent = '已显示正确答案。';
            feedbackTextEl.style.color = 'var(--primary-color)';
        }
    }

    function renderOrderQuestion(q) {
        const items = Array.isArray(q.items) ? q.items : [];
        const correctAnswer = Array.isArray(q.answer) ? q.answer : [];

        if (items.length === 0) {
            const msg = document.createElement('div');
            msg.textContent = '题目数据缺少 items，无法渲染。';
            optionsContainerEl.appendChild(msg);
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'hotspot-wrapper';

        const list = document.createElement('div');
        list.className = 'order-list';

        const shuffled = shuffleArray(items.slice());
        shuffled.forEach((text, idx) => {
            const row = document.createElement('div');
            row.className = 'order-row';
            row.dataset.value = text;
            row.dataset.index = String(idx);

            const handle = document.createElement('div');
            handle.className = 'order-handle';
            handle.textContent = '拖动';

            const content = document.createElement('div');
            content.className = 'order-content';
            content.innerHTML = formatText(text);

            const actions = document.createElement('div');
            actions.className = 'order-actions';

            const upBtn = document.createElement('button');
            upBtn.className = 'btn outline order-btn';
            upBtn.type = 'button';
            upBtn.textContent = '上移';
            upBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const prev = row.previousElementSibling;
                if (prev) list.insertBefore(row, prev);
            });

            const downBtn = document.createElement('button');
            downBtn.className = 'btn outline order-btn';
            downBtn.type = 'button';
            downBtn.textContent = '下移';
            downBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const next = row.nextElementSibling;
                if (next) list.insertBefore(next, row);
            });

            actions.appendChild(upBtn);
            actions.appendChild(downBtn);

            row.appendChild(handle);
            row.appendChild(content);
            row.appendChild(actions);
            list.appendChild(row);
        });

        enableDragReorder(list);
        wrapper.appendChild(list);
        optionsContainerEl.appendChild(wrapper);

        const submitBtn = document.createElement('button');
        submitBtn.textContent = '提交排序';
        submitBtn.className = 'btn primary full-width mt-1';
        submitBtn.addEventListener('click', () => {
            if (!feedbackContainerEl.classList.contains('hidden')) return;
            const userOrder = getOrderFromList(list);
            const isCorrect = userOrder.length === correctAnswer.length && userOrder.every((v, i) => v === correctAnswer[i]);
            recordAttempt(isCorrect);
            if (!isCorrect) addWrongQuestionId(q.id);
            updateStatsText();
            revealOrderAnswer({ list, userOrder, correctAnswer, userSubmitted: true });
        });
        optionsContainerEl.appendChild(submitBtn);

        currentHotspotState = { type: 'order', list, correctAnswer };
    }

    function getOrderFromList(listEl) {
        return Array.from(listEl.querySelectorAll('.order-row')).map(el => el.dataset.value || '');
    }

    function revealOrderAnswer({ list, userOrder, correctAnswer, userSubmitted }) {
        const rows = Array.from(list.querySelectorAll('.order-row'));
        rows.forEach((row, idx) => {
            row.classList.remove('correct', 'wrong');
            const val = row.dataset.value || '';
            if (correctAnswer?.[idx] === val) row.classList.add('correct');
            else row.classList.add('wrong');
        });

        feedbackContainerEl.classList.remove('hidden');
        if (userSubmitted) {
            const allCorrect = rows.every(r => r.classList.contains('correct'));
            if (allCorrect) {
                feedbackTextEl.textContent = 'Correct! ✅';
                feedbackTextEl.style.color = 'var(--correct-color)';
            } else {
                feedbackTextEl.textContent = 'Incorrect. ❌';
                feedbackTextEl.style.color = 'var(--wrong-color)';
            }
        } else {
            feedbackTextEl.textContent = '已显示正确答案。';
            feedbackTextEl.style.color = 'var(--primary-color)';
        }
    }

    function enableDragReorder(listEl) {
        let dragged = null;

        listEl.querySelectorAll('.order-row').forEach(row => {
            row.draggable = true;

            row.addEventListener('dragstart', (e) => {
                dragged = row;
                e.dataTransfer.effectAllowed = 'move';
                row.classList.add('dragging');
            });

            row.addEventListener('dragend', () => {
                row.classList.remove('dragging');
                dragged = null;
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const target = e.currentTarget;
                if (!dragged || target === dragged) return;

                const rect = target.getBoundingClientRect();
                const next = (e.clientY - rect.top) > (rect.height / 2);
                if (next) {
                    if (target.nextSibling !== dragged) listEl.insertBefore(dragged, target.nextSibling);
                } else {
                    if (target !== dragged.nextSibling) listEl.insertBefore(dragged, target);
                }
            });
        });
    }

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
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

    function updateManualWrongControls() {
        if (!manualWrongContainerEl) return;
        manualWrongContainerEl.classList.toggle('hidden', !isWrongMode);
        if (manualWrongBtnEl) manualWrongBtnEl.disabled = !isWrongMode;
        if (manualWrongInputEl) manualWrongInputEl.disabled = !isWrongMode;
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
        if (!q) return;
        const questionType = getQuestionType(q);
        if (questionType === 'mcq') {
            revealAnswer(null, String(q.answer || ''));
            return;
        }

        if (questionType === 'match' && currentHotspotState?.type === 'match') {
            const { wrapper, rows, correctAnswer } = currentHotspotState;
            const selects = wrapper.querySelectorAll('select.hotspot-select');
            selects.forEach((s, idx) => {
                const val = correctAnswer?.[idx];
                if (typeof val === 'string') s.value = val;
            });
            revealMatchAnswer({ wrapper, rows, userAnswer: correctAnswer, correctAnswer, userSubmitted: false });
            return;
        }

        if (questionType === 'order' && currentHotspotState?.type === 'order') {
            const { list, correctAnswer } = currentHotspotState;
            list.innerHTML = '';
            correctAnswer.forEach((text) => {
                const row = document.createElement('div');
                row.className = 'order-row';
                row.dataset.value = text;

                const handle = document.createElement('div');
                handle.className = 'order-handle';
                handle.textContent = '拖动';

                const content = document.createElement('div');
                content.className = 'order-content';
                content.innerHTML = formatText(text);

                const actions = document.createElement('div');
                actions.className = 'order-actions';

                const upBtn = document.createElement('button');
                upBtn.className = 'btn outline order-btn';
                upBtn.type = 'button';
                upBtn.textContent = '上移';

                const downBtn = document.createElement('button');
                downBtn.className = 'btn outline order-btn';
                downBtn.type = 'button';
                downBtn.textContent = '下移';

                actions.appendChild(upBtn);
                actions.appendChild(downBtn);

                row.appendChild(handle);
                row.appendChild(content);
                row.appendChild(actions);
                row.classList.add('correct');
                list.appendChild(row);
            });
            revealOrderAnswer({ list, userOrder: correctAnswer, correctAnswer, userSubmitted: false });
        }
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
        applyMode(!isWrongMode);
    });

    function parseIdList(raw) {
        const tokens = String(raw || '')
            .split(/[,，]/)
            .map(x => x.trim())
            .filter(Boolean);

        const ids = [];
        const invalid = [];

        tokens.forEach(token => {
            const num = Number(token);
            if (!Number.isFinite(num) || !Number.isInteger(num) || num <= 0) {
                invalid.push(token);
                return;
            }
            ids.push(String(num));
        });

        return { ids, invalid };
    }

    function addWrongIdsByInput() {
        if (!isWrongMode) return;
        if (!manualWrongInputEl) return;

        const { ids, invalid } = parseIdList(manualWrongInputEl.value);
        if (ids.length === 0) {
            alert('请输入题号（用逗号分隔）');
            return;
        }

        const allIdSet = new Set(allQuestions.map(q => String(q.id)));
        const notFound = [];
        const toAdd = [];

        ids.forEach(id => {
            if (!allIdSet.has(id)) notFound.push(id);
            else toAdd.push(id);
        });

        if (invalid.length > 0 || notFound.length > 0) {
            const parts = [];
            if (invalid.length > 0) parts.push(`格式错误：${invalid.join(', ')}`);
            if (notFound.length > 0) parts.push(`题库不存在：${notFound.join(', ')}`);
            alert(parts.join('\n'));
        }

        if (toAdd.length === 0) return;

        const oldActiveId = activeQuestions?.[currentIndex]?.id;
        const wrongIdSet = loadWrongQuestionIds();
        toAdd.forEach(id => wrongIdSet.add(String(id)));
        saveWrongQuestionIds(wrongIdSet);
        manualWrongInputEl.value = '';

        activeQuestions = getWrongQuestions();
        if (activeQuestions.length === 0) {
            currentIndex = 0;
        } else if (oldActiveId != null) {
            const idx = activeQuestions.findIndex(q => String(q.id) === String(oldActiveId));
            currentIndex = idx >= 0 ? idx : 0;
        } else {
            currentIndex = 0;
        }

        initQuiz();
    }

    if (manualWrongBtnEl) {
        manualWrongBtnEl.addEventListener('click', () => addWrongIdsByInput());
    }

    if (manualWrongInputEl) {
        manualWrongInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') addWrongIdsByInput();
        });
    }
});
