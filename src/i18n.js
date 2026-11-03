'use strict';
// 한/영 문구. 정적 HTML은 data-i18n(글자) · data-i18n-html(태그 포함) · data-i18n-title(툴팁) 속성의 키로,
// main.js의 동적 문구(상태 줄 · 범례)는 t(키)로 가져온다. 함수인 항목은 값을 받아 문장을 만든다.

const I18N = {
  ko: {
    lang: 'EN', langTitle: 'English (L)', help: '도움말', helpTitle: '범례 · 단축키 (H)',
    contact: '연락', contactTitle: '만든 사람 · 연락처', email: '이메일', copy: '복사', copied: '복사됨',
    'midi.connect': '연결', 'midi.off': '— 끔 —', 'midi.none': '포트 없음',
    'midi.t': '균사체 사건을 MIDI 음으로 신스 · DAW에 보낸다 (Chrome · Edge). 채널: 1 성장 · 2 먹이 · 3 파동 시작 · 4 스파이크 · 5 재진입 · 6 전극 · 7 드론 (CC74 = 흐름) · 8 화음 (CC1 = 파면) · 9 버섯. 소리를 켜야 동작하고, 소리를 꺼도 MIDI는 나간다',
    'midi.na': 'MIDI는 Chrome · Edge의 GitHub Pages 사이트에서 된다',
    'midi.denied': 'MIDI 사용 권한이 거부됐다. 브라우저 주소창의 사이트 설정에서 허용해 줘',
    rec: '녹화', 'rec.t': '무대를 소리와 함께 녹화해 영상 파일로 저장 (최대 60초, 다시 누르면 멈추고 저장)',
    'rec.na': '녹화는 이 안에서는 안 돼요 — GitHub Pages 사이트에서 열어 주세요 (biinggala.github.io/digital-fungi-sound)', 'bar.t': '조절 바 펼치기: 성장·전기 → 소리 → 접기 (C)',
    play: '재생', pause: '정지', reset: '리셋', 'reset.t': '새 군체로 다시 시작 (R)',
    tool: '도구', 'tool.spore': '포자', 'tool.food': '먹이', 'tool.stim': '자극', 'tool.probe': '전극',
    'tool.spore.t': '포자 심기 (1)', 'tool.food.t': '먹이 주기 — 끌어서 칠하기 (2)', 'tool.stim.t': '전기 자극 (3)', 'tool.probe.t': '기록 전극 꽂기 (4)',
    view: '보기', 'view.colony': '군체', 'view.flow': '흐름', soil: '토양',
    transport: '수송', 'transport.local': '국소', 'transport.global': '전역',
    'transport.t': '국소: 양분이 균사를 따라 실제로 옮겨 가고, 팁·매트·버섯은 자기 자리에 와 있는 양만 쓴다 · 전역: 군체 저장고 하나를 어디서나 바로 쓴다 (비교용). 바꾸면 새로 시작',
    zoom: '확대', 'zoom.t': '휠 · 핀치로 확대/축소, 끌어서 이동', 'fit.t': '꽉 채우기 ↔ 전체 보기 (F)',
    grow: '성장', elec: '전기',
    'p.speed': '속도', 'p.branch': '분기', 'p.chemo': '화학굴성', 'p.avoid': '자기회피', 'p.adapt': '적응',
    'p.flowExp': '경쟁 μ', 'p.flowExp.t': 'μ < 1: 여러 갈래로 퍼짐 · μ > 1: 평행한 길끼리 경쟁해 줄기로 모임',
    'p.spontaneous': '자발', 'p.spontaneous.t': 'tick당 어딘가에서 저절로 스파이크가 날 확률',
    'p.elecRecovery': '회복 ε', 'p.elecRecovery.t': '작을수록 불응기가 길다. 0.01 근처로 올리면 고리 안에서 신호가 끝없이 돈다 (재진입)',
    'p.fusionConduct': '고리 전도', 'p.fusionConduct.t': '융합 접합부가 전기를 얼마나 통하는지. 0이면 고리가 전기적으로 끊긴다',
    'p.spikeResponse': '스파이크 반응', 'p.spikeResponse.t': '스파이크를 맞은 팁의 분기 확률 증가 배수',
    scope: '전극', 'scope.empty': '전극 도구로 균사 클릭',
    fruitGrp: '결실', mat: '매트',
    'p.matGrowth': '매트 r', 'p.matGrowth.t': '균사 매트의 로지스틱 자람 속도 (/tick). 토양 양분에 따라 느려진다 (Monod)',
    'p.matSpread': '매트 D', 'p.matSpread.t': '매트가 옆 칸으로 번지는 확산 계수 (칸²/tick). 저장 양분이 줄면 덜 번진다. 계산 안정성 때문에 0.2까지',
    'p.fruitSat': '포화 문턱', 'p.fruitSat.t': '최근 300 tick 매트 면적 증가율이 이보다 작거나 순수입이 음수가 되면 (양분 제한 시작) 결실한다',
    'p.fruitShare': '결실 투자', 'p.fruitShare.t': '결실 한 번에 저장 양분의 몇 할을 버섯에 쓰나',
    stats: (s, full) => `${s.day.toFixed(1)}일째 (1초 ≈ ${s.lapse.toFixed(1)}일)   t ${s.t}   군체 ${s.colonies}   팁 ${s.tips}   세그먼트 ${s.nodes}   고리 ${s.fusions}/${s.loopsUsed}   ` +
      `대치 ${s.clashes}   스파이크 ${s.spikes}   먹이 발견 ${s.foodSignals}   양분 ${s.pool.toFixed(1)}   HGU ${s.hguMm.toFixed(1)} mm   ` +
      `매트 ${Math.round(s.matCover * 100)}%   버섯 ${s.fruits}/${s.fruitsTotal}` + (s.sporeColonies ? `   포자 군체 ${s.sporeColonies}` : '') + (full ? '   용량 가득' : ''),

    'page.chord': '화음', 'ch.root': '근음', 'ch.fifths': '5도권', 'ch.quality': '종류', 'ch.source': '화음은', 'ch.now': '지금', 'ch.space': '공간',
    'ch.m.scale': '음계', 'ch.m.scale.d': '화음 없음', 'ch.m.hold': '고정', 'ch.m.hold.d': '직접', 'ch.m.network': '균사체', 'ch.m.network.d': '진행',
    'ch.hint.scale': '화음 없이 고른 음계로 연주한다 (예전 소리). 근음이나 종류를 누르면 고정 화음이 된다',
    'ch.hint.hold': '균사체의 모든 음 (사건음 · 드론 · 화음)이 이 화음의 구성음에서 나온다',
    'ch.hint.network': '고른 화음을 I로 두고 I – vi – IV – V7 (단조면 i – VI – iv – V7). 군체가 두 배로 커질 때와 버섯이 올라올 때 한 칸씩 넘어간다',
    'page.sound': '소리', 'page.mixer': '믹서', 'page.sim': '시뮬레이션', 'panel.t': '판 열기 · 닫기 (C: 화음 → 소리 → 믹서 → 시뮬레이션 → 닫기)',
    'm.output': '출력', 'm.now': '지금', 'm.env': '환경', 'm.net': '네트워크', on: '켬', off: '끔', fit: '맞춤',
    'st.day': '일째', 'st.lapse': '일 / 초', 'st.colonies': '군체', 'st.tips': '팁', 'st.nodes': '세그먼트', 'st.loops': '고리',
    'st.clashes': '대치', 'st.spikes': '스파이크', 'st.food': '먹이 발견', 'st.pool': '양분', 'st.hgu': 'HGU mm', 'st.mat': '매트', 'st.fruits': '버섯',
    'sd.drone': '드론', 'sd.pad': '화음 음 수', 'sd.grains': '성장음 / 초', 'sd.front': '파면', 'sd.voices': '발음', 'sd.bpm': '템포', 'sd.reentry': '재진입',
    sound: '소리', soundOn: '소리 켜기', soundOffAct: '소리 끄기', soundOff: '소리 꺼짐', 'soundOn.t': '소리 켜기 · 끄기 (M). 브라우저는 클릭한 뒤에만 소리를 낼 수 있다',
    volume: '볼륨',
    style: '스타일', 'style.mix': '섞임', key: '키', scale: '음계', reverb: '잔향', echo: '에코',
    'echo.t': '좌우가 엇갈리는 테이프 에코 (길이는 공간 채널이 정한다. Eno: 3.1초 / 4.3초)',
    mixer: '믹서', 'mixer.t': '채널마다 스타일 띠를 끌어서 섞는다. 두 스타일 사이면 두 악기가 함께 울린다', vol: '음량',
    'sound.off': '소리 꺼짐',
    'sound.stats': (s) => `드론 ${s.drone}   화음 ${s.pad}성   성장음 ${s.grains}/s   파면 ${s.front}   발음 ${s.voices}` +
      (s.bpm.length ? `   ♩${s.bpm.join(' ♩')}` : '') + (s.reentry ? `   재진입 ♥${s.reentry}` : ''),
    'ch.grow': '성장', 'ch.food': '먹이 발견', 'ch.start': '파동 시작', 'ch.tok': '스파이크', 'ch.heart': '재진입 ♥',
    'ch.probe': '기록 전극', 'ch.drone': '드론', 'ch.pad': '화음·파면', 'ch.space': '공간', 'ch.fruit': '버섯',
    'style.lab': '연구실', 'style.eno': 'Eno 앰비언트', 'style.moss': 'Moss Garden (David Bowie)', 'style.greenhouse': 'Green-House', 'style.aphex': 'Aphex Twin', 'style.sunra': 'Sun Ra · Cosmic Tones (1963)',
    'scale.minorPenta': '단조 5음', 'scale.majorPenta': '장조 5음', 'scale.lydian': '리디안', 'scale.dorian': '도리안',
    'scale.wholeTone': '온음', 'scale.slendro': '슬렌드로', 'scale.inScale': '인 음계', 'scale.chromatic': '반음계',

    'help.legend.colony': () => '굵기 = 전도도 D (많이 쓴 길일수록 굵어짐) · 노란 선 = 융합 간선 (고리를 닫는 우회로) · ' +
      '균사가 밝아지며 지나가는 띠 = 전기 신호, 그 뒤 잠깐 어두워짐 = 불응기 · ' +
      '옅은 솜 = 균사 매트 (버섯과 포자는 그리지 않는다 — 버섯이 생긴 곳은 양분이 몰리며 굵어지는 줄기로 보인다)',
    'help.legend.flow': (a, b) => `${a}흡수해서 내보내는 쪽 · ${b}받아서 쓰는 쪽 · 굵기 = 흐름이 많았던 경로`,
    'help.body': '<b>도구</b> 클릭 · 1 포자 · 2 먹이(끌어서 칠하기) · 3 자극 · 4 전극<br>' +
      '<b>화면</b> 끌어서 이동 (먹이 도구는 오른쪽 버튼으로 끌기) · 휠/핀치 확대 · F 꽉 채우기 ↔ 전체 보기<br>' +
      '<b>키</b> Space 재생/정지 · R 리셋 · V 보기 · M 소리 켜기·끄기 · L 한/EN · H 도움말 · C 판 열기 (화음 → 소리 → 믹서 → 시뮬레이션 → 닫기) · Esc 닫기<br>' +
      '<b>손잡이</b> 위아래로 끌거나 휠로 조절 · 두 번 누르면 처음 값<br>' +
      '<b>믹서</b> 띠는 왼쪽부터 연구실 · Eno · Moss Garden · Green-House · Aphex · Sun Ra. 두 스타일 사이면 두 악기가 함께 울리고, 놓을 때 스타일 근처면 붙는다. 음량 0 = 채널 끄기 (드론을 끄면 \'우웅\'이 사라진다)<br>' +
      '<b>척도</b> 1 tick ≈ 33분, 1 px ≈ 0.26 mm (화면 가로 ≈ 24 cm). 실측 균사 전선 속도(8.4 mm/일)에 맞춘 값. 날짜와 배속은 시뮬레이션 판의 네트워크 칸, 무대 오른쪽 아래에 축척<br>' +
      '<b>재진입</b> 900 tick쯤 키운 뒤 회복 ε를 0.01로 올리고 가운데를 자극<br>' +
      '<b>결실</b> 매트가 땅을 다 채우거나 양분이 모자라기 시작하면, 저장 양분으로 버섯을 올린다. 버섯 쪽으로 양분이 흐르며 줄기가 굵어지고, 다 자라면 포자를 날린다. 포자는 빈 땅에서만 싹튼다',
  },
  en: {
    lang: '한', langTitle: '한국어 (L)', help: 'Help', helpTitle: 'Legend · shortcuts (H)',
    contact: 'Contact', contactTitle: 'Made by · contact', email: 'Email', copy: 'Copy', copied: 'Copied',
    'midi.connect': 'Connect', 'midi.off': '— off —', 'midi.none': 'no ports',
    'midi.t': 'Send mycelium events as MIDI notes to a synth or DAW (Chrome / Edge). Channels: 1 growth · 2 food · 3 wave start · 4 spikes · 5 reentry · 6 electrode · 7 drone (CC74 = flow) · 8 chord (CC1 = wavefront) · 9 mushroom. Needs sound started; MIDI keeps going when sound is off',
    'midi.na': 'MIDI works in Chrome or Edge on the GitHub Pages site',
    'midi.denied': 'MIDI permission was denied. Allow it in the site settings next to the address bar',
    rec: 'Rec', 'rec.t': 'Record the stage with sound and save a video file (up to 60 s; press again to stop and save)',
    'rec.na': 'Recording does not work inside this embed. Open the GitHub Pages site (biinggala.github.io/digital-fungi-sound)', 'bar.t': 'Expand controls: growth·electric → sound → collapse (C)',
    play: 'Play', pause: 'Pause', reset: 'Reset', 'reset.t': 'Start over with a new colony (R)',
    tool: 'Tool', 'tool.spore': 'Spore', 'tool.food': 'Food', 'tool.stim': 'Stim', 'tool.probe': 'Probe',
    'tool.spore.t': 'Plant a spore (1)', 'tool.food.t': 'Add food — drag to paint (2)', 'tool.stim.t': 'Electrical stimulus (3)', 'tool.probe.t': 'Place recording electrode (4)',
    view: 'View', 'view.colony': 'Colony', 'view.flow': 'Flow', soil: 'Soil',
    transport: 'Transport', 'transport.local': 'Local', 'transport.global': 'Global',
    'transport.t': 'Local: nutrients actually move along the hyphae, and tips, mat and mushrooms use only what has arrived at their spot · Global: one colony store usable anywhere at once (for comparison). Switching restarts',
    zoom: 'Zoom', 'zoom.t': 'Wheel / pinch to zoom, drag to pan', 'fit.t': 'Fill stage ↔ whole world (F)',
    grow: 'Growth', elec: 'Electric',
    'p.speed': 'Speed', 'p.branch': 'Branch', 'p.chemo': 'Chemo', 'p.avoid': 'Avoid', 'p.adapt': 'Adapt',
    'p.flowExp': 'COMPETE μ', 'p.flowExp.t': 'μ < 1: spreads into many strands · μ > 1: parallel paths compete and merge into cords',
    'p.spontaneous': 'Spont', 'p.spontaneous.t': 'Chance per tick that a spike fires somewhere on its own',
    'p.elecRecovery': 'RECOVERY ε', 'p.elecRecovery.t': 'Smaller = longer refractory period. Near 0.01 signals circulate around loops forever (reentry)',
    'p.fusionConduct': 'Loop cond', 'p.fusionConduct.t': 'How well fusion junctions conduct. 0 cuts loops electrically',
    'p.spikeResponse': 'Spike boost', 'p.spikeResponse.t': 'Branching multiplier for a tip hit by a spike',
    scope: 'Probe', 'scope.empty': 'click a hypha with Probe',
    fruitGrp: 'Fruit', mat: 'Mat',
    'p.matGrowth': 'Mat r', 'p.matGrowth.t': 'Logistic growth rate of the mycelial mat (/tick), slowed by soil nutrient (Monod)',
    'p.matSpread': 'Mat D', 'p.matSpread.t': 'Diffusion coefficient of mat spread (cells²/tick), reduced when reserves are low. Capped at 0.2 for numerical stability',
    'p.fruitSat': 'Saturation', 'p.fruitSat.t': 'Fruit when mat area grew less than this over 300 ticks, or net income turned negative (onset of nutrient limitation)',
    'p.fruitShare': 'Invest', 'p.fruitShare.t': 'Share of stored nutrient spent on one flush of mushrooms',
    stats: (s, full) => `day ${s.day.toFixed(1)} (1 s ≈ ${s.lapse.toFixed(1)} d)   t ${s.t}   colonies ${s.colonies}   tips ${s.tips}   segments ${s.nodes}   loops ${s.fusions}/${s.loopsUsed}   ` +
      `clashes ${s.clashes}   spikes ${s.spikes}   food found ${s.foodSignals}   stored ${s.pool.toFixed(1)}   HGU ${s.hguMm.toFixed(1)} mm   ` +
      `mat ${Math.round(s.matCover * 100)}%   mushrooms ${s.fruits}/${s.fruitsTotal}` + (s.sporeColonies ? `   spore colonies ${s.sporeColonies}` : '') + (full ? '   full' : ''),

    'page.chord': 'Chord', 'ch.root': 'Root', 'ch.fifths': 'circle of fifths', 'ch.quality': 'Quality', 'ch.source': 'Chord from', 'ch.now': 'Now', 'ch.space': 'Space',
    'ch.m.scale': 'Scale', 'ch.m.scale.d': 'no chord', 'ch.m.hold': 'Hold', 'ch.m.hold.d': 'manual', 'ch.m.network': 'Network', 'ch.m.network.d': 'progress',
    'ch.hint.scale': 'Plays the chosen scale with no chord (the original sound). Pick a root or quality to hold a chord',
    'ch.hint.hold': 'Every note the mycelium makes (events, drone, pad) comes from this chord',
    'ch.hint.network': 'Your chord is I, then I – vi – IV – V7 (minor: i – VI – iv – V7). Advances each time the colony doubles and when a mushroom appears',
    'page.sound': 'Sound', 'page.mixer': 'Mixer', 'page.sim': 'Sim', 'panel.t': 'Open · close panels (C: chord → sound → mixer → sim → close)',
    'm.output': 'Output', 'm.now': 'Now', 'm.env': 'Environment', 'm.net': 'Network', on: 'On', off: 'Off', fit: 'Fit',
    'st.day': 'Day', 'st.lapse': 'Days / s', 'st.colonies': 'Colonies', 'st.tips': 'Tips', 'st.nodes': 'Segments', 'st.loops': 'Loops',
    'st.clashes': 'Clashes', 'st.spikes': 'Spikes', 'st.food': 'Food found', 'st.pool': 'Stored', 'st.hgu': 'HGU mm', 'st.mat': 'Mat', 'st.fruits': 'Mushrooms',
    'sd.drone': 'Drone', 'sd.pad': 'Chord notes', 'sd.grains': 'Growth / s', 'sd.front': 'Front', 'sd.voices': 'Voices', 'sd.bpm': 'Tempo', 'sd.reentry': 'Reentry',
    sound: 'Sound', soundOn: 'Sound on', soundOffAct: 'Sound off', soundOff: 'Sound off', 'soundOn.t': 'Sound on / off (M). Browsers only allow audio after a click',
    volume: 'Vol',
    style: 'Style', 'style.mix': 'mixed', key: 'Key', scale: 'Scale', reverb: 'Reverb', echo: 'Echo',
    'echo.t': 'Cross-fed stereo tape echo (lengths set by the Space channel. Eno: 3.1 s / 4.3 s)',
    mixer: 'Mixer', 'mixer.t': 'Drag each channel along the style strip. Between two styles, both instruments play', vol: 'Vol',
    'sound.off': 'sound off',
    'sound.stats': (s) => `drone ${s.drone}   chord ${s.pad}   growth ${s.grains}/s   front ${s.front}   voices ${s.voices}` +
      (s.bpm.length ? `   ♩${s.bpm.join(' ♩')}` : '') + (s.reentry ? `   reentry ♥${s.reentry}` : ''),
    'ch.grow': 'Growth', 'ch.food': 'Food found', 'ch.start': 'Wave start', 'ch.tok': 'Spikes', 'ch.heart': 'Reentry ♥',
    'ch.probe': 'Electrode', 'ch.drone': 'Drone', 'ch.pad': 'Pad·front', 'ch.space': 'Space', 'ch.fruit': 'Mushroom',
    'style.lab': 'Lab', 'style.eno': 'Eno ambient', 'style.moss': 'Moss Garden (David Bowie)', 'style.greenhouse': 'Green-House', 'style.aphex': 'Aphex Twin', 'style.sunra': 'Sun Ra · Cosmic Tones (1963)',
    'scale.minorPenta': 'Minor penta', 'scale.majorPenta': 'Major penta', 'scale.lydian': 'Lydian', 'scale.dorian': 'Dorian',
    'scale.wholeTone': 'Whole tone', 'scale.slendro': 'Slendro', 'scale.inScale': 'In (miyako-bushi)', 'scale.chromatic': 'Chromatic',

    'help.legend.colony': () => 'width = conductance D (well-used paths thicken) · yellow = fusion edges (loop-closing shortcuts) · ' +
      'a band of light running along the hyphae = electrical signal, the brief dimming behind it = refractory period · ' +
      'pale fuzz = mycelial mat (mushrooms and spores are not drawn — a fruiting site shows as cords thickening toward it)',
    'help.legend.flow': (a, b) => `${a}absorbing & exporting · ${b}receiving & consuming · width = how much has flowed`,
    'help.body': '<b>Tools</b> click · 1 spore · 2 food (drag to paint) · 3 stim · 4 probe<br>' +
      '<b>View</b> drag to pan (with Food, right-drag) · wheel/pinch to zoom · F fill ↔ whole world<br>' +
      '<b>Keys</b> Space play/pause · R reset · V view · M sound on/off · L 한/EN · H help · C open panels (chord → sound → mixer → sim → close) · Esc close<br>' +
      '<b>Knobs</b> drag up/down or scroll · double-click resets<br>' +
      '<b>Mixer</b> strip runs Lab · Eno · Moss Garden · Green-House · Aphex · Sun Ra. Between two styles both instruments play; released near a style it snaps. Vol 0 = channel off (turn the drone off to remove the hum)<br>' +
      '<b>Scale</b> 1 tick ≈ 33 min, 1 px ≈ 0.26 mm (stage ≈ 24 cm wide), calibrated to a measured hyphal front speed (8.4 mm/day). Day and time-lapse in the Sim panel, scale bar bottom-right<br>' +
      '<b>Reentry</b> grow ~900 ticks, raise Recovery ε to 0.01, stimulate the center<br>' +
      '<b>Fruiting</b> once the mat has filled the ground or nutrients start to run short, reserves go into mushrooms. Nutrient flows toward them (cords thicken), mature caps release spores, which germinate only on free ground',
  },
};

let LANG = 'en';  // 기본은 영어. 한 번 한국어로 바꾸면 그 선택을 기억한다
try { if (localStorage.getItem('fungi.lang') === 'ko') LANG = 'ko'; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }

function t(key, ...args) {
  const v = I18N[LANG][key] ?? I18N.ko[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}

function setLang(lang) {
  LANG = lang;
  try { localStorage.setItem('fungi.lang', lang); } catch (e) { /* 이번 방문 동안만 */ }
  applyI18n();
}

function applyI18n() {
  document.documentElement.lang = LANG;
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of document.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
}
