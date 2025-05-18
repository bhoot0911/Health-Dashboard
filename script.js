// --- Application Constants ---
const MOOD_PULSE_KEY = 'vitalsphere_moodPulseData';
const NUTRI_LOG_KEY = 'vitalsphere_nutriLogMeals';
const WATER_LOG_KEY = 'vitalsphere_waterData';
const WEIGHT_LOG_KEY = 'vitalsphere_weightData';
const CALORIE_GOAL = 2500;
const POSITIVE_MOOD_THRESHOLD = 2; // Mood value >= this is considered positive

// --- Global State ---
let allMoodData = [], allNutriData = [], allWaterData = [], allWeightData = [];
let sortedUniqueDates = [];
let charts = {}; // Stores Chart.js instances
let currentEffectiveDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

// --- DOM Elements ---
const currentVitalsContent = document.getElementById('currentVitalsContent');
const streaksContent = document.getElementById('streaksContent');
const mockDataHelper = document.getElementById('mockDataHelper');
const monthYearEl = document.getElementById('monthYear');
const datesEl = document.getElementById('calendarDates');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const dnaSpinner = document.getElementById('dnaSpinner');

// --- Calendar State ---
let calendarDisplayedDate = new Date(); // For the calendar's current month/year view
let calendarSelectedDate = new Date();  // For the user-selected date
let calendarEventDays = {}; // Indicates days with any data

// --- Utility Functions ---
function getCssVar(variableName) {
    return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim().replace(/'/g, '');
}

function getMoodDetail(moodValue) {
    const MOOD_DETAILS = [
        { value: 0, name: 'Subdued', emoji: '📉', color: getCssVar('--mood-color-0') },
        { value: 1, name: 'Stable', emoji: '😐', color: getCssVar('--mood-color-1') },
        { value: 2, name: 'Positive', emoji: '🙂', color: getCssVar('--mood-color-2') },
        { value: 3, name: 'Elevated', emoji: '😄', color: getCssVar('--mood-color-3') },
        { value: 4, name: 'Optimal', emoji: '🤩', color: getCssVar('--mood-color-4') }
    ];
    return MOOD_DETAILS.find(m => m.value === moodValue) || MOOD_DETAILS[1];
}

function getDailyCalories(dateStr, data) {
    return data
        .filter(meal => new Date(meal.timestamp).toISOString().split('T')[0] === dateStr)
        .reduce((sum, meal) => sum + (Number(meal.calories) || 0), 0) || null;
}

function getDataForDate(dateStr, dataArray, key = 'value') {
    const entry = dataArray.find(d => d.date === dateStr);
    return entry ? entry[key] : null;
}

function formatDateForStorage(dateObj) {
    // Consistently formats dates to YYYY-MM-DD for storage and comparison
    return dateObj.toISOString().split('T')[0];
}

// UI Element
function createDNARungs() {
    if (!dnaSpinner) return;
    dnaSpinner.querySelectorAll('.dna-rung').forEach(rung => rung.remove());
    const numRungs = 10; // Number of rungs in the DNA visual
    for (let i = 0; i < numRungs; i++) {
        const rung = document.createElement('div');
        rung.classList.add('dna-rung');
        const yPos = (i / (numRungs -1)) * 90 + 5;
        const rotation = i * (360 / numRungs) * 0.5;
        rung.style.top = `${yPos}%`;
        rung.style.transform = `translate(-50%, -50%) rotateY(${rotation}deg) translateZ(0px)`;
        dnaSpinner.appendChild(rung);
    }
}

// --- Calendar ---
function updateCalendarEventDays() {
    calendarEventDays = {};
    sortedUniqueDates.forEach(dateStr => { calendarEventDays[dateStr] = true; });
}

function renderCalendar() {
    const year = calendarDisplayedDate.getFullYear();
    const month = calendarDisplayedDate.getMonth();
    monthYearEl.textContent = `${calendarDisplayedDate.toLocaleString('default', { month: 'long' })} ${year}`;
    datesEl.innerHTML = '';

    const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 for Sunday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDaysCount = new Date(year, month, 0).getDate();

    // Days from previous month
    for (let i = 0; i < firstDayOfMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('other-month');
        dayEl.textContent = prevMonthDaysCount - firstDayOfMonth + 1 + i;
        datesEl.appendChild(dayEl);
    }

    // Days of current month
    for (let i = 1; i <= daysInMonth; i++) {
        const dayEl = document.createElement('div');
        dayEl.textContent = i;
        const fullDate = new Date(year, month, i);
        const fullDateStr = formatDateForStorage(fullDate);
        const todayStr = formatDateForStorage(new Date());

        if (fullDateStr === todayStr) dayEl.classList.add('today');
        if (calendarSelectedDate && fullDateStr === formatDateForStorage(calendarSelectedDate)) {
            dayEl.classList.add('selected');
        }
        if (calendarEventDays[fullDateStr]) {
            const dot = document.createElement('span');
            dot.classList.add('event-dot');
            dayEl.appendChild(dot);
        }
        dayEl.addEventListener('click', () => {
            calendarSelectedDate = new Date(year, month, i);
            currentEffectiveDate = formatDateForStorage(calendarSelectedDate);
            renderCalendar();
            renderDashboard();
        });
        datesEl.appendChild(dayEl);
    }
    // Days from next month to fill grid
    const totalCellsRendered = datesEl.children.length;
    const cellsToFill = (totalCellsRendered <= 35) ? 35 - totalCellsRendered : 42 - totalCellsRendered;
    for (let i = 1; i <= cellsToFill; i++) {
        const dayEl = document.createElement('div');
        dayEl.classList.add('other-month');
        dayEl.textContent = i;
        datesEl.appendChild(dayEl);
    }
}

prevMonthBtn.addEventListener('click', () => {
    calendarDisplayedDate.setMonth(calendarDisplayedDate.getMonth() - 1);
    renderCalendar();
});
nextMonthBtn.addEventListener('click', () => {
    calendarDisplayedDate.setMonth(calendarDisplayedDate.getMonth() + 1);
    renderCalendar();
});

// --- Data Management & Dashboard Rendering ---
mockDataHelper.addEventListener('click', () => generateMockDataForHealthDashboard());

function loadAllData() {
    allMoodData = JSON.parse(localStorage.getItem(MOOD_PULSE_KEY) || '[]');
    allNutriData = JSON.parse(localStorage.getItem(NUTRI_LOG_KEY) || '[]');
    allWaterData = JSON.parse(localStorage.getItem(WATER_LOG_KEY) || '[]');
    allWeightData = JSON.parse(localStorage.getItem(WEIGHT_LOG_KEY) || '[]');

    const dateSet = new Set();
    [allMoodData, allWaterData, allWeightData].forEach(arr => arr.forEach(d => d.date && dateSet.add(d.date)));
    allNutriData.forEach(d => d.timestamp && dateSet.add(new Date(d.timestamp).toISOString().split('T')[0]));
    sortedUniqueDates = Array.from(dateSet).sort((a,b) => new Date(a) - new Date(b));
    updateCalendarEventDays();

    const todayStr = formatDateForStorage(new Date());
    if (sortedUniqueDates.length > 0) {
        currentEffectiveDate = sortedUniqueDates.includes(todayStr) ? todayStr : sortedUniqueDates[sortedUniqueDates.length - 1];
        mockDataHelper.textContent = "Recalibrate Sample Data";
    } else {
        currentEffectiveDate = todayStr;
        mockDataHelper.textContent = "No Data. Try Sample Data?";
    }

    calendarSelectedDate = new Date(currentEffectiveDate + "T00:00:00");
    calendarDisplayedDate = new Date(calendarSelectedDate.getFullYear(), calendarSelectedDate.getMonth(), 1);
    renderCalendar();
}

function renderDashboard() {
    if (!currentEffectiveDate && sortedUniqueDates.length === 0 && allNutriData.length === 0) {
        displayNoDataMessages(); return;
    }
    clearNoDataMessagesFromCharts();

    const dataForSelectedPeriod = {
        mood: allMoodData.filter(d => d.date <= currentEffectiveDate),
        nutri: allNutriData.filter(d => new Date(d.timestamp).toISOString().split('T')[0] <= currentEffectiveDate),
        water: allWaterData.filter(d => d.date <= currentEffectiveDate),
        weight: allWeightData.filter(d => d.date <= currentEffectiveDate),
    };
    renderCurrentVitals(dataForSelectedPeriod);
    renderStreaks(dataForSelectedPeriod);

    const effectiveDateObj = new Date(currentEffectiveDate + "T00:00:00");
    const chartStartDate = new Date(effectiveDateObj);
    chartStartDate.setDate(effectiveDateObj.getDate() - 6); // 7-day view (current + 6 previous)
    const chartStartDateStr = formatDateForStorage(chartStartDate);

    const chartDisplayData = {
        mood: dataForSelectedPeriod.mood.filter(d => d.date >= chartStartDateStr),
        nutri: dataForSelectedPeriod.nutri.filter(d => new Date(d.timestamp).toISOString().split('T')[0] >= chartStartDateStr),
        water: dataForSelectedPeriod.water.filter(d => d.date >= chartStartDateStr),
        weight: dataForSelectedPeriod.weight.filter(d => d.date >= chartStartDateStr),
    };
    const chartPeriodDates = sortedUniqueDates.filter(d => d >= chartStartDateStr && d <= currentEffectiveDate);

    renderMoodTrendChart(chartDisplayData.mood, chartPeriodDates);
    renderCalorieLogChart(chartDisplayData.nutri, chartPeriodDates);
    renderWeightTrendChart(chartDisplayData.weight, chartPeriodDates);
    renderWaterIntakeChart(chartDisplayData.water, chartPeriodDates);
}

function displayNoDataMessages() {
    currentVitalsContent.innerHTML = '<p class="no-data-message">Log activities to see vital signs.</p>';
    streaksContent.innerHTML = '<p class="no-data-message">Log data to build consistency.</p>';
    Object.values(charts).forEach(chart => chart?.destroy());
    charts = {};
    document.querySelectorAll('.chart-container').forEach(cc => {
        const canvasId = cc.querySelector('canvas')?.id;
        if (canvasId) setupChartNoData(canvasId, 'Insufficient data for this period.');
    });
}

function clearNoDataMessagesFromCharts() {
    document.querySelectorAll('.chart-container').forEach(cc => {
        cc.querySelector('.no-data-message')?.remove();
        const canvas = cc.querySelector('canvas');
        if (canvas) canvas.style.display = 'block';
    });
}

function renderCurrentVitals(data) {
    const moodEntry = data.mood.find(m => m.date === currentEffectiveDate);
    const mood = moodEntry ? getMoodDetail(moodEntry.mood) : getMoodDetail(1);
    const calories = getDailyCalories(currentEffectiveDate, data.nutri);
    const weight = getDataForDate(currentEffectiveDate, data.weight, 'weight');
    const water = getDataForDate(currentEffectiveDate, data.water, 'amount');

    currentVitalsContent.innerHTML = `
        <div class="vital-item">
            <i class="far fa-smile icon-mood" style="color: ${mood.color};"></i>
            <div class="value mood-emoji">${mood.emoji}</div><div class="label">${mood.name}</div>
        </div>
        <div class="vital-item">
            <i class="fas fa-fire-alt icon-calories"></i>
            <div class="value">${calories !== null ? calories : 'N/A'}</div><div class="label">Energy <span class="unit">(kcal)</span></div>
        </div>
        <div class="vital-item">
            <i class="fas fa-weight icon-weight"></i>
            <div class="value">${weight !== null ? weight : 'N/A'}</div><div class="label">Mass <span class="unit">(kg)</span></div>
        </div>
        <div class="vital-item">
            <i class="fas fa-tint icon-water"></i>
            <div class="value">${water !== null ? (water / 1000).toFixed(1) : 'N/A'}</div><div class="label">Fluids <span class="unit">(L)</span></div>
        </div>`;
}

function renderStreaks(data) {
    let moodStreak = 0;
    const relevantDates = sortedUniqueDates.filter(d => d <= currentEffectiveDate).reverse();
    for (const date of relevantDates) {
        const entry = data.mood.find(m => m.date === date);
        if (entry && entry.mood >= POSITIVE_MOOD_THRESHOLD) moodStreak++; else break;
    }
    let calorieStreak = 0;
    for (const date of relevantDates) {
        const dailyCal = getDailyCalories(date, data.nutri);
        if (dailyCal !== null && dailyCal > 0 && dailyCal <= CALORIE_GOAL) calorieStreak++;
        else if (dailyCal !== null && dailyCal > 0) break;
    }
    streaksContent.innerHTML = `
        <div class="streak-item">
            <div class="streak-emoji">${moodStreak > 0 ? (moodStreak > 3 ? '🌟' : '👍') : '🔄'}</div>
            <div class="streak-days">${moodStreak}</div><div class="streak-label">Positive State</div>
        </div>
        <div class="streak-item">
            <div class="streak-emoji">${calorieStreak > 0 ? (calorieStreak > 3 ? '🏆' : '✅') : '🎯'}</div>
            <div class="streak-days">${calorieStreak}</div><div class="streak-label">Energy Target</div>
        </div>`;
}

// --- Chart Configuration and Rendering ---
const commonChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: 'rgba(18, 22, 38, 0.95)', titleColor: getCssVar('--accent-primary'),
            bodyColor: getCssVar('--text-primary'), borderColor: getCssVar('--pane-border'),
            borderWidth: 1, padding: 10, cornerRadius: parseFloat(getCssVar('--border-radius-md')),
            boxPadding: 5, titleFont: { weight: '500', size: 13 }, bodyFont: { weight: '300', size: 12 },
            displayColors: false,
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) { label += ': '; }
                    if (context.parsed.y !== null) {
                         if (context.chart.id === 'moodTrendChart') return getMoodDetail(context.parsed.y).name;
                        label += context.parsed.y;
                         if (context.chart.id === 'calorieLogChart') label += ' kcal';
                         if (context.chart.id === 'weightTrendChart') label += ' kg';
                         if (context.chart.id === 'waterIntakeChart') label += ' ml';
                    }
                    return label;
                }
            }
        }
    },
    scales: {
        x: {
            type: 'time', time: { unit: 'day', tooltipFormat: 'MMM d, yyyy', displayFormats: { day: 'd' } },
            grid: { display: false },
            ticks: { color: getCssVar('--text-muted'), font: { size: 10, weight: '300' }, maxRotation: 0, autoSkipPadding: 10 }
        },
        y: {
            beginAtZero: true,
            grid: { color: getCssVar('--widget-border'), drawBorder: false, lineWidth: 0.4 },
            ticks: { color: getCssVar('--text-muted'), font: { size: 10, weight: '300' }, padding: 6 }
        }
    },
    interaction: { intersect: false, mode: 'index' },
};

function setupChartNoData(canvasId, message = 'No data to display for this period.') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const parent = canvas.parentElement;
    canvas.style.display = 'none';
    let msgEl = parent.querySelector('.no-data-message');
    if (!msgEl) {
        msgEl = document.createElement('p');
        msgEl.className = 'no-data-message';
        parent.appendChild(msgEl);
    }
    msgEl.textContent = message;
}

function renderChart(canvasId, type, data, customOptions = {}) {
    if (charts[canvasId]) charts[canvasId].destroy();
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    // Check if all datasets within the data are empty
    const noDataInDatasets = !data || data.datasets.every(ds => ds.data.length === 0);

    if (noDataInDatasets) {
         let noDataMessage = 'No data available for this period.';
         if (canvasId === 'moodTrendChart') noDataMessage = 'Log mood entries to see your spectrum.';
         else if (canvasId === 'calorieLogChart') noDataMessage = 'Log meals to track energy intake.';
         else if (canvasId === 'weightTrendChart') noDataMessage = 'Log weight to see your progress.';
         else if (canvasId === 'waterIntakeChart') noDataMessage = 'Log water intake for fluid balance.';
        setupChartNoData(canvasId, noDataMessage);
        return;
    }
    const existingNoDataMsg = canvas.parentElement.querySelector('.no-data-message');
    if (existingNoDataMsg) existingNoDataMsg.remove();

    canvas.style.display = 'block';
    charts[canvasId] = new Chart(canvas.getContext('2d'), {
        type,
        data,
        options: { ...commonChartOptions, ...customOptions }
    });
}

function renderMoodTrendChart(moodData, dates) {
    const dataPoints = dates.map(date => ({ x: date, y: getDataForDate(date, moodData, 'mood') }));
    renderChart('moodTrendChart', 'line', {
        datasets: [{
            label: 'Mood', data: dataPoints, borderColor: getCssVar('--accent-secondary'),
            backgroundColor: dataPoints.map(dp => dp.y !== null ? getMoodDetail(dp.y).color : 'rgba(120,120,120,0.1)'),
            pointRadius: 4, pointHoverRadius: 7, pointBorderColor: getCssVar('--widget-bg'),
            pointBorderWidth: 1.5, tension: 0.35, spanGaps: true,
        }]
    }, { scales: { y: { min: 0, max: 4, ticks: { stepSize: 1, callback: val => getMoodDetail(val).emoji } } } });
}

function renderCalorieLogChart(nutriData, dates) {
    const dataPoints = dates.map(date => ({ x: date, y: getDailyCalories(date, nutriData) }));
    renderChart('calorieLogChart', 'bar', {
        datasets: [{
            label: 'Calories', data: dataPoints,
            backgroundColor: dataPoints.map(dp => (dp.y || 0) > CALORIE_GOAL ? getCssVar('--danger-accent') : getCssVar('--accent-primary')),
            borderWidth: 0, borderRadius: 5, borderSkipped: false,
            barPercentage: 0.55, categoryPercentage: 0.65
        }]
    });
}

function renderWeightTrendChart(weightData, dates) {
    const dataPoints = dates.map(date => ({ x: date, y: getDataForDate(date, weightData, 'weight') }));
    renderChart('weightTrendChart', 'line', {
        datasets: [{
            label: 'Weight (kg)', data: dataPoints, borderColor: getCssVar('--accent-secondary'),
            backgroundColor: getCssVar('--accent-secondary-alpha-10'), fill: 'start',
            tension: 0.35, pointRadius: 3, pointBackgroundColor: getCssVar('--accent-secondary'),
            pointBorderColor: getCssVar('--widget-bg'), pointBorderWidth: 1.5,
            pointHoverRadius: 7, spanGaps: true,
        }]
    });
}

function renderWaterIntakeChart(waterData, dates) {
    const dataPoints = dates.map(date => ({ x: date, y: getDataForDate(date, waterData, 'amount') }));
    renderChart('waterIntakeChart', 'bar', {
        datasets: [{
            label: 'Water (ml)', data: dataPoints, backgroundColor: getCssVar('--accent-primary'),
            borderWidth: 0, borderRadius: 5, borderSkipped: false,
            barPercentage: 0.55, categoryPercentage: 0.65
        }]
    });
}

// --- Mock Data Generation ---
window.generateMockDataForHealthDashboard = function() {
    const today = new Date(); const mockMood = []; const mockNutri = []; const mockWater = []; const mockWeight = [];
    let currentWeight = 72 + (Math.random() - 0.5) * 8; // Starting weight around 72kg

    for (let i = 45; i >= 0; i--) { // Generate data for the last 45 days
        const date = new Date(today); date.setDate(today.getDate() - i);
        const dateStr = formatDateForStorage(date);

        mockMood.push({ date: dateStr, mood: Math.floor(Math.random() * 5) }); // Random mood 0-4

        if (Math.random() > 0.1) { // 90% chance to log meals
            const numMeals = Math.floor(Math.random() * 2) + 1; // 1-3 meals
            for (let j = 0; j < numMeals; j++) {
                const mealCals = 200 + Math.floor(Math.random() * 650); // Calories between 200-850
                const mealTime = new Date(dateStr);
                mealTime.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60)); // Random meal time
                mockNutri.push({ id: `${dateStr}-m-${j}`, name: `Meal ${j+1}`, calories: mealCals, emoji: '🍽️', timestamp: mealTime.getTime() });
            }
        }
        if (Math.random() > 0.15) { // 85% chance to log water
            mockWater.push({ date: dateStr, amount: (Math.floor(Math.random() * 10) + 2) * 250 }); // 500ml to 3000ml
        }
        if (i % (Math.floor(Math.random()*2)+2) === 0 && Math.random() > 0.25) { // Log weight periodically
             currentWeight += (Math.random() - 0.51) * (Math.random() * 0.7 + 0.1); // Small weight fluctuations
             mockWeight.push({ date: dateStr, weight: parseFloat(currentWeight.toFixed(1)) });
        }
    }
    localStorage.setItem(MOOD_PULSE_KEY, JSON.stringify(mockMood));
    localStorage.setItem(NUTRI_LOG_KEY, JSON.stringify(mockNutri));
    localStorage.setItem(WATER_LOG_KEY, JSON.stringify(mockWater));
    localStorage.setItem(WEIGHT_LOG_KEY, JSON.stringify(mockWeight));
    loadAllData(); renderDashboard(); // Reload and render all data
};

// --- UI Enhancements ---
function observeWidgets() {
    const widgets = document.querySelectorAll('.widget');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
            }
        });
    }, { threshold: 0.1 });
    widgets.forEach(widget => { observer.observe(widget); });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {

    Chart.defaults.font.family = getCssVar('--font-family');
    Chart.defaults.font.weight = '300';
    Chart.defaults.color = getCssVar('--text-muted');

    createDNARungs();
    loadAllData();
    renderDashboard();
    observeWidgets();
});