document.addEventListener('DOMContentLoaded', () => {
    let questions = [];
    let currentIndex = 0;
    
    // DOM Elements
    const questionIdEl = document.getElementById('question-id');
    const questionTextEl = document.getElementById('question-text');
    const optionsContainerEl = document.getElementById('options-container');
    const feedbackContainerEl = document.getElementById('feedback-container');
    const feedbackTextEl = document.getElementById('feedback-text');
    const explanationTextEl = document.getElementById('explanation-text');
    const progressTextEl = document.getElementById('progress-text');
    const progressFillEl = document.getElementById('progress-fill');
    
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const showAnswerBtn = document.getElementById('show-answer-btn');
    const jumpInput = document.getElementById('jump-input');
    const jumpBtn = document.getElementById('jump-btn');
    
    // Load Questions
    fetch('questions.json')
        .then(response => response.json())
        .then(data => {
            questions = data;
            // Load progress from local storage if available
            const savedIndex = localStorage.getItem('aws-ai-quiz-index');
            if (savedIndex && !isNaN(savedIndex) && savedIndex < questions.length) {
                currentIndex = parseInt(savedIndex);
            }
            
            initQuiz();
        })
        .catch(err => {
            questionTextEl.textContent = 'Error loading questions. Please ensure questions.json exists.';
            console.error('Error:', err);
        });
    
    function initQuiz() {
        updateProgress();
        renderQuestion();
        updateControls();
    }
    
    function renderQuestion() {
        const q = questions[currentIndex];
        
        // Reset state
        feedbackContainerEl.classList.add('hidden');
        optionsContainerEl.innerHTML = '';
        
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
            
            optionEl.addEventListener('click', () => handleOptionClick(key, q.answer));
            
            optionsContainerEl.appendChild(optionEl);
        });
        
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

    function handleOptionClick(selectedKey, correctKey) {
        // If already answered/shown, do nothing
        if (!feedbackContainerEl.classList.contains('hidden')) return;
        
        revealAnswer(selectedKey, correctKey);
    }
    
    function revealAnswer(selectedKey, correctKey) {
        const options = optionsContainerEl.querySelectorAll('.option');
        
        options.forEach(opt => {
            const key = opt.dataset.key;
            
            // Remove previous classes
            opt.classList.remove('selected', 'correct', 'wrong');
            
            if (key === correctKey) {
                opt.classList.add('correct');
            }
            
            if (selectedKey && key === selectedKey) {
                if (key !== correctKey) {
                    opt.classList.add('wrong');
                } else {
                    opt.classList.add('selected'); // Just to highlight user choice if correct
                }
            }
        });
        
        feedbackContainerEl.classList.remove('hidden');
        if (selectedKey) {
             if (selectedKey === correctKey) {
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
        progressTextEl.textContent = `Question ${currentIndex + 1} of ${questions.length}`;
        const percentage = ((currentIndex + 1) / questions.length) * 100;
        progressFillEl.style.width = `${percentage}%`;
        
        // Save progress
        localStorage.setItem('aws-ai-quiz-index', currentIndex);
    }
    
    function updateControls() {
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex === questions.length - 1;
    }
    
    // Event Listeners
    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            initQuiz();
        }
    });
    
    nextBtn.addEventListener('click', () => {
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            initQuiz();
        }
    });
    
    showAnswerBtn.addEventListener('click', () => {
        const q = questions[currentIndex];
        revealAnswer(null, q.answer);
    });
    
    jumpBtn.addEventListener('click', () => {
        const val = parseInt(jumpInput.value);
        if (val >= 1 && val <= questions.length) {
            currentIndex = val - 1; // 0-indexed
            initQuiz();
        } else {
            alert(`Please enter a number between 1 and ${questions.length}`);
        }
    });
});
