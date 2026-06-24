/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  MessageSquareText,
  BrainCircuit,
  Sparkles,
  FileSpreadsheet,
  Presentation,
  Layers,
  Gamepad2,
  FolderHeart,
  BarChart3,
  Palette,
  Search,
  GraduationCap,
  Plus,
  Trash2,
  Lock,
  Unlock,
  X,
  ExternalLink,
  Briefcase,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Settings,
  XCircle,
  BookOpen
} from 'lucide-react';

// Interfaces
interface Tool {
  id: string;
  name: string;
  url: string;
  description: string;
  category: 'work' | 'class' | 'other';
  price: 'free' | 'paid' | 'both';
  iconName: string;
}

interface TeacherInfo {
  school: string;
  subject: string;
  name: string;
}

// Initial default tools database with witty/sensible Korean descriptions
const DEFAULT_TOOLS: Tool[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    url: 'https://chat.openai.com',
    description: '행정 공문 초안 작성부터 복잡한 엑셀 수식 설계까지, 퇴근 시간을 최소 1시간 앞당겨주는 교무실의 만능 AI 비서!',
    category: 'work',
    price: 'both',
    iconName: 'MessageSquareText'
  },
  {
    id: 'claude',
    name: 'Claude',
    url: 'https://claude.ai',
    description: '수십 장짜리 교육청 공문 PDF 파일도 단 3초 만에 핵심만 추출하는 요약 및 전문 보고서 기획의 독보적인 1인자.',
    category: 'work',
    price: 'both',
    iconName: 'BrainCircuit'
  },
  {
    id: 'gemini',
    name: 'Gemini',
    url: 'https://gemini.google.com',
    description: '구글 워크스페이스(Docs, Sheets, Drive)와 긴밀하게 호환되어 학급 데이터 수집과 문서 협업을 자동화하는 구글 생태계 요정.',
    category: 'work',
    price: 'both',
    iconName: 'Sparkles'
  },
  {
    id: 'notion-ai',
    name: 'Notion AI',
    url: 'https://www.notion.so/product/ai',
    description: '학급 교육과정 수립부터 주간 학습 안내장까지, 정돈된 노션 문서 안에서 AI 초안을 바로 수정·완성하는 스마트 에디터.',
    category: 'work',
    price: 'paid',
    iconName: 'FileSpreadsheet'
  },
  {
    id: 'gamma',
    name: 'Gamma',
    url: 'https://gamma.app',
    description: '수업 주제나 키워드 한 줄만 던져주면 고품격 피프티(PPT) 슬라이드와 실용적인 학습지를 자동 제작해 주는 요술 방망이!',
    category: 'class',
    price: 'both',
    iconName: 'Presentation'
  },
  {
    id: 'padlet',
    name: 'Padlet',
    url: 'https://padlet.com',
    description: '발표가 쑥스러운 아이들도 실시간으로 디지털 포스트잇을 붙이며 다채롭게 생각을 펼쳐 나가는 쌍방향 소통 담벼락.',
    category: 'class',
    price: 'both',
    iconName: 'Layers'
  },
  {
    id: 'kahoot',
    name: 'Kahoot!',
    url: 'https://kahoot.com',
    description: '지루할 틈 없는 신나는 모바일 퀴즈 배틀! 교실 전체를 뜨거운 퀴즈 쇼 경연장으로 변신시켜 몰입도를 높이는 치트키.',
    category: 'class',
    price: 'both',
    iconName: 'Gamepad2'
  },
  {
    id: 'quizlet',
    name: 'Quizlet',
    url: 'https://quizlet.com',
    description: '난해한 수학 공식이나 암기 영단어를 귀여운 게임식 카드 맞추기와 퀴즈 매치로 쉽게 외우게 돕는 학습 놀이터.',
    category: 'class',
    price: 'both',
    iconName: 'FolderHeart'
  },
  {
    id: 'mentimeter',
    name: 'Mentimeter',
    url: 'https://www.mentimeter.com',
    description: '수업 도중 즉시 생성하는 실시간 투표와 알록달록한 워드 클라우드로 아이들의 호기심과 피드백을 한눈에 수집하는 도구.',
    category: 'class',
    price: 'both',
    iconName: 'BarChart3'
  },
  {
    id: 'canva',
    name: 'Canva for Education',
    url: 'https://www.canva.com/education/',
    description: '디자인 걱정은 끝! 교직원 인증 시 전체 유료 템플릿을 완전 무료로 사용해 카드뉴스와 학습지를 마음껏 찍어내는 도화지.',
    category: 'class',
    price: 'free',
    iconName: 'Palette'
  },
  {
    id: 'perplexity',
    name: 'Perplexity AI',
    url: 'https://www.perplexity.ai',
    description: '단순한 대답을 넘어 실시간 웹 크롤링을 통해 답변과 출처 링크를 명확히 달아주는 논리정연한 학술 자료 탐색 메이트.',
    category: 'other',
    price: 'both',
    iconName: 'Search'
  },
  {
    id: 'google-classroom',
    name: 'Google Classroom',
    url: 'https://classroom.google.com',
    description: '과제 배포, 실시간 피드백 송신, 자동 채점 및 과제 수거까지 탄탄한 구글 인프라로 온·오프라인 수업을 아우르는 메인 허브.',
    category: 'other',
    price: 'free',
    iconName: 'GraduationCap'
  }
];

const DEFAULT_TEACHER: TeacherInfo = {
  school: '창원여자고등학교',
  subject: '수학교사',
  name: 'KIM'
};

const DEFAULT_PW = '1234';

// Dynamic icon element mapper to avoid importing hundreds of individual custom items
function ToolIcon({ name, className }: { name: string; className?: string }) {
  const map: Record<string, React.ComponentType<{ className?: string }>> = {
    MessageSquareText,
    BrainCircuit,
    Sparkles,
    FileSpreadsheet,
    Presentation,
    Layers,
    Gamepad2,
    FolderHeart,
    BarChart3,
    Palette,
    Search,
    GraduationCap,
    Briefcase,
    Wrench,
    HelpCircle,
    BookOpen
  };
  const IconComponent = map[name] || HelpCircle;
  return <IconComponent className={className} />;
}

export default function App() {
  // States
  const [tools, setTools] = useState<Tool[]>([]);
  const [teacher, setTeacher] = useState<TeacherInfo>(DEFAULT_TEACHER);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'work' | 'class' | 'other'>('all');
  const [priceFilter, setPriceFilter] = useState<'all' | 'free' | 'paid' | 'both'>('all');
  
  // Admin & Modal States
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'password' | 'add' | 'delete' | 'editTeacher' | 'successAdd' | 'successDel'>('password');
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  
  // New tool form states
  const [newToolName, setNewToolName] = useState('');
  const [newToolUrl, setNewToolUrl] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolCat, setNewToolCat] = useState<'work' | 'class' | 'other'>('work');
  const [newToolPrice, setNewToolPrice] = useState<'free' | 'paid' | 'both'>('free');
  const [newToolIcon, setNewToolIcon] = useState('MessageSquareText');

  // Teacher info form states
  const [tempSchool, setTempSchool] = useState('');
  const [tempSubject, setTempSubject] = useState('');
  const [tempName, setTempName] = useState('');

  // Delete pending target
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingDeleteName, setPendingDeleteName] = useState('');

  // Pending action identifier when opening password modal
  // 'toggle_admin' | 'add_tool' | 'edit_teacher'
  const [pendingAction, setPendingAction] = useState<'toggle_admin' | 'add_tool' | 'edit_teacher'>('toggle_admin');

  // Load tools and teacher info from LocalStorage on mount
  useEffect(() => {
    const savedTools = localStorage.getItem('school_webtools_list');
    if (savedTools) {
      try {
        setTools(JSON.parse(savedTools));
      } catch (e) {
        setTools(DEFAULT_TOOLS);
      }
    } else {
      setTools(DEFAULT_TOOLS);
      localStorage.setItem('school_webtools_list', JSON.stringify(DEFAULT_TOOLS));
    }

    const savedTeacher = localStorage.getItem('school_webtools_teacher');
    if (savedTeacher) {
      try {
        setTeacher(JSON.parse(savedTeacher));
      } catch (e) {
        setTeacher(DEFAULT_TEACHER);
      }
    } else {
      setTeacher(DEFAULT_TEACHER);
    }
  }, []);

  // Save tools to localstorage helper
  const saveToolsToStorage = (updatedList: Tool[]) => {
    setTools(updatedList);
    localStorage.setItem('school_webtools_list', JSON.stringify(updatedList));
  };

  // Filter tools based on query, category and price filter
  const filteredTools = useMemo(() => {
    return tools.filter(tool => {
      // Category filter
      if (activeCategory !== 'all' && tool.category !== activeCategory) {
        return false;
      }
      // Price filter
      if (priceFilter !== 'all') {
        if (priceFilter === 'free' && tool.price !== 'free') return false;
        if (priceFilter === 'paid' && tool.price !== 'paid') return false;
        if (priceFilter === 'both' && tool.price !== 'both') return false;
      }
      // Search query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesName = tool.name.toLowerCase().includes(query);
        const matchesDesc = tool.description.toLowerCase().includes(query);
        const matchesCat = (tool.category === 'work' ? '업무용' : tool.category === 'class' ? '수업용' : '기타').includes(query);
        return matchesName || matchesDesc || matchesCat;
      }
      return true;
    });
  }, [tools, activeCategory, priceFilter, searchQuery]);

  // Count helper functions
  const stats = useMemo(() => {
    const total = tools.length;
    const workCount = tools.filter(t => t.category === 'work').length;
    const classCount = tools.filter(t => t.category === 'class').length;
    const otherCount = tools.filter(t => t.category === 'other').length;
    return { total, workCount, classCount, otherCount };
  }, [tools]);

  // Reset database back to default list helper
  const resetDatabase = () => {
    if (window.confirm('모든 데이터를 최초 기본값으로 초기화하시겠습니까? 추가된 도구들이 사라집니다.')) {
      saveToolsToStorage(DEFAULT_TOOLS);
      setTeacher(DEFAULT_TEACHER);
      localStorage.setItem('school_webtools_teacher', JSON.stringify(DEFAULT_TEACHER));
      alert('초기화가 완료되었습니다.');
    }
  };

  // Toggle Admin mode password confirmation helper
  const handleToggleAdminClick = () => {
    if (isAdmin) {
      // Turn off
      setIsAdmin(false);
    } else {
      // Trigger Password Modal
      setPendingAction('toggle_admin');
      setPasswordInput('');
      setPasswordError('');
      setModalType('password');
      setIsModalOpen(true);
    }
  };

  // Password submission confirmation
  const handlePasswordSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (passwordInput === DEFAULT_PW) {
      setPasswordError('');
      if (pendingAction === 'toggle_admin') {
        setIsAdmin(true);
        setIsModalOpen(false);
      } else if (pendingAction === 'add_tool') {
        // Open add tool modal screen directly
        setNewToolName('');
        setNewToolUrl('');
        setNewToolDesc('');
        setNewToolCat('work');
        setNewToolPrice('free');
        setNewToolIcon('MessageSquareText');
        setModalType('add');
      } else if (pendingAction === 'edit_teacher') {
        // Open edit teacher details form
        setTempSchool(teacher.school);
        setTempSubject(teacher.subject);
        setTempName(teacher.name);
        setModalType('editTeacher');
      }
    } else {
      setPasswordError('비밀번호가 올바르지 않습니다. 다시 입력해 주세요.');
      setPasswordInput('');
    }
  };

  // Open Add Tool trigger
  const triggerAddToolModal = () => {
    if (isAdmin) {
      setNewToolName('');
      setNewToolUrl('');
      setNewToolDesc('');
      setNewToolCat('work');
      setNewToolPrice('free');
      setNewToolIcon('MessageSquareText');
      setModalType('add');
      setIsModalOpen(true);
    } else {
      setPendingAction('add_tool');
      setPasswordInput('');
      setPasswordError('');
      setModalType('password');
      setIsModalOpen(true);
    }
  };

  // Submit new tool into list
  const handleAddToolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newToolName.trim() || !newToolUrl.trim() || !newToolDesc.trim()) {
      alert('이름, URL, 그리고 한 줄 설명은 필수 항목입니다.');
      return;
    }

    // Format URL schema safely
    let formattedUrl = newToolUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) {
      formattedUrl = 'https://' + formattedUrl;
    }

    const newId = 'tool_' + Date.now();
    const newToolItem: Tool = {
      id: newId,
      name: newToolName.trim(),
      url: formattedUrl,
      description: newToolDesc.trim(),
      category: newToolCat,
      price: newToolPrice,
      iconName: newToolIcon
    };

    const updatedList = [...tools, newToolItem];
    saveToolsToStorage(updatedList);
    
    // Show beautiful success screen briefly
    setModalType('successAdd');
    setTimeout(() => {
      setIsModalOpen(false);
    }, 1500);
  };

  // Open Delete confirmation
  const triggerDeleteConfirm = (id: string, name: string) => {
    setPendingDeleteId(id);
    setPendingDeleteName(name);
    setModalType('delete');
    setIsModalOpen(true);
  };

  // Confirm delete handler
  const handleDeleteConfirm = () => {
    if (!pendingDeleteId) return;
    const updatedList = tools.filter(t => t.id !== pendingDeleteId);
    saveToolsToStorage(updatedList);
    setPendingDeleteId(null);
    setPendingDeleteName('');
    
    setModalType('successDel');
    setTimeout(() => {
      setIsModalOpen(false);
    }, 1300);
  };

  // Trigger edit teacher info
  const triggerEditTeacherModal = () => {
    if (isAdmin) {
      setTempSchool(teacher.school);
      setTempSubject(teacher.subject);
      setTempName(teacher.name);
      setModalType('editTeacher');
      setIsModalOpen(true);
    } else {
      setPendingAction('edit_teacher');
      setPasswordInput('');
      setPasswordError('');
      setModalType('password');
      setIsModalOpen(true);
    }
  };

  // Save edited teacher info
  const handleTeacherSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedTeacher: TeacherInfo = {
      school: tempSchool.trim() || DEFAULT_TEACHER.school,
      subject: tempSubject.trim() || DEFAULT_TEACHER.subject,
      name: tempName.trim() || DEFAULT_TEACHER.name
    };
    setTeacher(updatedTeacher);
    localStorage.setItem('school_webtools_teacher', JSON.stringify(updatedTeacher));
    setIsModalOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased flex flex-col selection:bg-blue-100 selection:text-blue-900">
      
      {/* HEADER NAV */}
      <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Logo */}
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white shadow-sm flex items-center justify-center">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <span id="nav-logo" className="text-lg font-extrabold text-white tracking-tight flex items-center gap-1.5">
                WebTool <span className="text-blue-400 font-medium text-xs bg-slate-800 px-2 py-0.5 rounded-full">수업 &amp; 업무용 Web Portal</span>
              </span>
            </div>
          </div>

          {/* Quick links & Admin button */}
          <div className="flex items-center space-x-4">
            <nav className="hidden md:flex items-center space-x-6 text-sm font-semibold">
              <a href="#category-section" className="text-slate-300 hover:text-white transition-colors">카테고리 분류</a>
              <a href="#stats-section" className="text-slate-300 hover:text-white transition-colors">이용 현황</a>
            </nav>
            <div className="h-4 w-px bg-slate-700 hidden md:block"></div>
            
            <button
              id="btnEditNav"
              onClick={handleToggleAdminClick}
              className={`flex items-center space-x-2 text-xs font-bold px-3.5 py-1.5 rounded-full border transition-all duration-200 cursor-pointer ${
                isAdmin 
                  ? 'bg-red-500 text-white border-red-400 hover:bg-red-600 shadow' 
                  : 'bg-transparent text-slate-300 border-slate-700 hover:border-slate-500 hover:text-white'
              }`}
            >
              {isAdmin ? (
                <>
                  <X className="h-3.5 w-3.5" />
                  <span>편집 모드 종료</span>
                </>
              ) : (
                <>
                  <Settings className="h-3.5 w-3.5" />
                  <span>도구 편집 (관리자)</span>
                </>
              )}
            </button>
          </div>

        </div>
      </header>

      {/* ADMIN HERO BANNER */}
      {isAdmin && (
        <div id="editBanner" className="bg-blue-600 text-white text-center py-2 px-4 text-xs font-bold animate-pulse flex items-center justify-center gap-2 border-b border-blue-500">
          <Settings className="h-3.5 w-3.5 shrink-0" />
          <span>관리자 편집 모드 활성화 중 — 카드의 [✕] 아이콘으로 도구를 바로 삭제하거나 아래의 [도구 추가] 버튼을 클릭해 등록하세요.</span>
        </div>
      )}

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-850 to-blue-950 text-white py-16 px-4 sm:px-6 lg:px-8 text-center shadow-inner">
        {/* Background Grid Accent */}
        <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
        
        <div className="relative max-w-4xl mx-auto">
          {/* Teacher Badge Info */}
          <div className="inline-flex items-center space-x-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-bold px-4 py-1.5 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping"></span>
            <span>✦ {teacher.school} {teacher.subject} {teacher.name}</span>
            {isAdmin && (
              <button 
                onClick={triggerEditTeacherModal}
                className="ml-2 underline text-blue-400 hover:text-blue-300 font-semibold cursor-pointer"
                title="교사 정보 수정"
              >
                [정보 수정]
              </button>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white leading-tight tracking-tight mb-4">
            학교 업무 및 수업용 <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">웹툴 포털</span>
          </h1>
          <p className="text-slate-300 text-sm sm:text-base md:text-lg max-w-2xl mx-auto mb-8 font-medium leading-relaxed">
            복잡한 교무실 행정 처리와 역동적인 수업 설계를 도와줄<br className="hidden sm:inline" /> 
            핵심 AI 어시스턴트 및 교육용 플랫폼 링크 모음집입니다.
          </p>

          {/* Search Box */}
          <div className="relative max-w-xl mx-auto bg-white/10 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 shadow-xl focus-within:border-blue-500/40 transition-all">
            <div className="flex items-center">
              <Search className="h-5 w-5 text-slate-400 ml-4 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="도구 이름, 한 줄 설명, 키워드로 검색..."
                className="w-full bg-transparent border-0 outline-none ring-0 focus:ring-0 text-white placeholder-slate-400 px-3 py-3 text-sm font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="p-1 hover:bg-white/10 rounded-full mr-1.5 transition-colors cursor-pointer"
                  title="검색어 지우기"
                >
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* MAIN CONTENT CONTAINER */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* METRICS / STATS CARD */}
        <div id="stats-section" className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm text-center relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-slate-400 to-slate-600"></div>
            <span className="text-2xl font-black text-slate-800">{stats.total}</span>
            <p className="text-xs font-semibold text-slate-500 mt-1">전체 등록 도구</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm text-center relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400"></div>
            <span className="text-2xl font-black text-blue-600">{stats.workCount}</span>
            <p className="text-xs font-semibold text-slate-500 mt-1">💼 업무용 도구</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm text-center relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-400"></div>
            <span className="text-2xl font-black text-emerald-600">{stats.classCount}</span>
            <p className="text-xs font-semibold text-slate-500 mt-1">🎓 수업용 도구</p>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm text-center relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-500 to-pink-400"></div>
            <span className="text-2xl font-black text-purple-600">{stats.otherCount}</span>
            <p className="text-xs font-semibold text-slate-500 mt-1">🔧 기타 도구</p>
          </div>
        </div>

        {/* FILTER CATEGORIES & CONTROLS */}
        <div id="category-section" className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-200 pb-6 mb-8">
          
          {/* Main Categories Buttons */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              전체 보기
            </button>
            <button
              onClick={() => setActiveCategory('work')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCategory === 'work'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Briefcase className="h-3.5 w-3.5" />
              <span>💼 업무용</span>
            </button>
            <button
              onClick={() => setActiveCategory('class')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCategory === 'class'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <GraduationCap className="h-3.5 w-3.5" />
              <span>🎓 수업용</span>
            </button>
            <button
              onClick={() => setActiveCategory('other')}
              className={`px-4 py-2 text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                activeCategory === 'other'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Wrench className="h-3.5 w-3.5" />
              <span>🔧 기타</span>
            </button>
          </div>

          {/* Secondary Filter: Price options & Tool Actions */}
          <div className="flex items-center gap-2.5 w-full md:w-auto self-stretch md:self-auto justify-between md:justify-end">
            <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold">
              <button
                onClick={() => setPriceFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${priceFilter === 'all' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                전체 요금
              </button>
              <button
                onClick={() => setPriceFilter('free')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${priceFilter === 'free' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                무료
              </button>
              <button
                onClick={() => setPriceFilter('paid')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${priceFilter === 'paid' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                유료
              </button>
              <button
                onClick={() => setPriceFilter('both')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${priceFilter === 'both' ? 'bg-slate-100 text-slate-900 font-bold' : 'text-slate-500 hover:text-slate-900'}`}
              >
                무료+유료
              </button>
            </div>

            <button
              onClick={triggerAddToolModal}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl shadow-sm hover:shadow transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>도구 추가</span>
            </button>
          </div>

        </div>

        {/* CATEGORY SENSIBLE DESCRIPTIONS HEADER */}
        <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4 mb-8 text-xs sm:text-sm text-slate-600 flex items-start gap-3">
          <div className="p-1.5 bg-white rounded-lg text-blue-500 shrink-0 shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <h4 className="font-extrabold text-slate-800 mb-0.5">선택된 카테고리 정보</h4>
            {activeCategory === 'all' && (
              <p>교실과 교무실에서 활용 가능한 똑똑하고 실전적인 모든 에듀테크 및 AI 도구들을 한눈에 살펴보세요.</p>
            )}
            {activeCategory === 'work' && (
              <p className="font-medium text-blue-700">💼 <strong>업무용 도구:</strong> 지루하고 무거운 학교 행정 업무와 번거로운 문서 대조 및 공문서 작성을 혁신적으로 줄여서 빠른 퇴근과 쾌적한 교무 업무를 실현해 주는 소중한 비서들입니다.</p>
            )}
            {activeCategory === 'class' && (
              <p className="font-medium text-emerald-700">🎓 <strong>수업용 도구:</strong> 매 학기 수업 준비 아이디어와 학습자료 기획의 귀찮음을 해결하고, 학생들의 자발적 참여와 눈빛의 반짝임을 이끌어내는 최고의 교실 맞춤형 에듀테크 도구들입니다.</p>
            )}
            {activeCategory === 'other' && (
              <p className="font-medium text-purple-700">🔧 <strong>기타 도구:</strong> 교재 연구 시 논문 조사부터 출처가 정교한 지식 백과 탐색, 혹은 온·오프라인 과제 배포 및 학급 연동을 탄탄하게 잡아주는 유용한 보조 소프트웨어 모음입니다.</p>
            )}
          </div>
        </div>

        {/* CARDS GRID */}
        {filteredTools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTools.map((tool) => (
              <div 
                key={tool.id}
                className="group relative bg-white border border-slate-200/90 rounded-2xl p-5 hover:border-blue-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between"
              >
                
                {/* Delete Button overlay inside admin mode */}
                {isAdmin && (
                  <button
                    onClick={() => triggerDeleteConfirm(tool.id, tool.name)}
                    className="absolute -top-2.5 -right-2.5 bg-red-500 text-white rounded-full p-1.5 border-2 border-white hover:bg-red-600 shadow-md transition-colors z-10 cursor-pointer hover:scale-105 active:scale-95"
                    title="이 도구 삭제하기"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}

                {/* Card Top Section */}
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className={`p-3 rounded-xl flex items-center justify-center shrink-0 ${
                      tool.category === 'work' 
                        ? 'bg-blue-50 text-blue-600' 
                        : tool.category === 'class' 
                          ? 'bg-emerald-50 text-emerald-600' 
                          : 'bg-purple-50 text-purple-600'
                    }`}>
                      <ToolIcon name={tool.iconName} className="h-6 w-6" />
                    </div>
                    
                    {/* Price Badge */}
                    <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-full ${
                      tool.price === 'free' 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200/50' 
                        : tool.price === 'paid' 
                          ? 'bg-amber-100 text-amber-800 border border-amber-200/50' 
                          : 'bg-indigo-100 text-indigo-800 border border-indigo-200/50'
                    }`}>
                      {tool.price === 'free' ? '무료' : tool.price === 'paid' ? '유료' : '무료+유료'}
                    </span>
                  </div>

                  <h3 className="text-base font-extrabold text-slate-800 group-hover:text-blue-600 transition-colors duration-200 mb-1.5 flex items-center gap-1.5">
                    {tool.name}
                  </h3>
                  
                  <p className="text-slate-600 text-xs sm:text-sm leading-relaxed mb-6 font-medium">
                    {tool.description}
                  </p>
                </div>

                {/* Card Footer Section */}
                <div className="border-t border-slate-100 pt-4 mt-auto flex items-center justify-between">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                    tool.category === 'work' 
                      ? 'bg-blue-50 text-blue-700' 
                      : tool.category === 'class' 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'bg-purple-50 text-purple-700'
                  }`}>
                    {tool.category === 'work' ? '업무지원' : tool.category === 'class' ? '수업지원' : '기타보조'}
                  </span>
                  
                  <a 
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-slate-400 group-hover:text-blue-600 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span>바로가기</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>

              </div>
            ))}
          </div>
        ) : (
          /* EMPTY STATE */
          <div className="bg-white border border-slate-200 rounded-3xl py-16 px-4 text-center max-w-xl mx-auto shadow-sm">
            <div className="p-4 bg-slate-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4 text-slate-400">
              <Search className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">검색 결과가 없습니다</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6 leading-relaxed">
              검색 키워드를 다시 한 번 확인해 보시거나, 다른 필터를 통해 도구를 찾아보세요.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
                setPriceFilter('all');
              }}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
            >
              모든 필터 초기화하기
            </button>
          </div>
        )}

        {/* FACTORY RESET IN THE BOTTOM FOR COMFORT */}
        <div className="mt-16 text-center border-t border-slate-200 pt-8">
          <p className="text-xs text-slate-400 mb-2">언제든지 기본 리스트 상태로 깨끗하게 원상복구 할 수 있습니다.</p>
          <button 
            onClick={resetDatabase}
            className="text-xs font-bold text-slate-500 hover:text-red-500 hover:underline cursor-pointer"
          >
            기본 설정 리스트로 전체 데이터 초기화하기
          </button>
        </div>

      </main>

      {/* FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-800 py-10 text-center text-slate-500 text-xs font-medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© {teacher.school} {teacher.subject} • 업무 및 수업 교실 필수 웹툴 모음 포털</p>
          <p className="text-slate-600">실시간 로컬 세션 영구 보존 모드 탑재</p>
        </div>
      </footer>

      {/* ── MODAL OVERLAY PORTAL ── */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 transition-all duration-300"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close trigger button */}
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-4 right-4 p-2 bg-slate-50 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="닫기"
            >
              <X className="h-4 w-4" />
            </button>

            {/* PASSWORD VERIFICATION FORM SCREEN */}
            {modalType === 'password' && (
              <form onSubmit={handlePasswordSubmit}>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                  <Lock className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-800 mb-1">관리자 인증</h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  웹툴 항목을 추가, 수정, 삭제하려면 관리자 비밀번호가 필요합니다.<br/>
                  <span className="text-blue-500 font-semibold">(초기 비밀번호 힌트: 1234)</span>
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">비밀번호 입력</label>
                  <input
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="비밀번호를 입력하세요"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium outline-none focus:border-blue-500 transition-colors"
                    autoFocus
                  />
                  {passwordError && (
                    <p className="text-xs text-red-500 font-semibold mt-1.5 flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>{passwordError}</span>
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors cursor-pointer"
                >
                  인증 완료하기
                </button>
              </form>
            )}

            {/* ADD TOOL FORM SCREEN */}
            {modalType === 'add' && (
              <form onSubmit={handleAddToolSubmit}>
                <h2 className="text-xl font-extrabold text-slate-800 mb-1">새 도구 추가하기</h2>
                <p className="text-xs text-slate-500 mb-6">아래 상세 내용을 작성하시면 북마크 카드가 포털에 즉시 추가됩니다.</p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">도구 이름 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={newToolName}
                      onChange={(e) => setNewToolName(e.target.value)}
                      placeholder="예: ChatGPT, Canva"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">바로가기 URL 주소 <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      required
                      value={newToolUrl}
                      onChange={(e) => setNewToolUrl(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">센스있는 한 줄 설명 <span className="text-red-500">*</span></label>
                    <textarea
                      required
                      rows={3}
                      value={newToolDesc}
                      onChange={(e) => setNewToolDesc(e.target.value)}
                      placeholder="이 도구를 어떻게 쓰면 편한지 정교하고 멋지게 설명해 주세요!"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">분류 카테고리</label>
                      <select
                        value={newToolCat}
                        onChange={(e) => setNewToolCat(e.target.value as any)}
                        className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold focus:border-blue-500 outline-none bg-white"
                      >
                        <option value="work">💼 업무용</option>
                        <option value="class">🎓 수업용</option>
                        <option value="other">🔧 기타</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 mb-1">요금 형태 분류</label>
                      <select
                        value={newToolPrice}
                        onChange={(e) => setNewToolPrice(e.target.value as any)}
                        className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold focus:border-blue-500 outline-none bg-white"
                      >
                        <option value="free">🆓 완전무료</option>
                        <option value="paid">💳 일부유료</option>
                        <option value="both">🔄 무료+유료</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">도구 대표 아이콘</label>
                    <select
                      value={newToolIcon}
                      onChange={(e) => setNewToolIcon(e.target.value)}
                      className="w-full border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold focus:border-blue-500 outline-none bg-white"
                    >
                      <option value="MessageSquareText">💬 대화형 챗봇 (ChatGPT 등)</option>
                      <option value="BrainCircuit">🧠 분석 및 지능 (Claude 등)</option>
                      <option value="Sparkles">✨ 다기능 AI 추천 (Gemini 등)</option>
                      <option value="FileSpreadsheet">📑 파일 및 워크시트 (Notion 등)</option>
                      <option value="Presentation">📊 파워포인트 발표 (Gamma 등)</option>
                      <option value="Layers">🥞 레이아웃 및 캔버스 (Padlet 등)</option>
                      <option value="Gamepad2">🎮 퀴즈 및 게임 배틀 (Kahoot 등)</option>
                      <option value="FolderHeart">📂 정리 카드보드 (Quizlet 등)</option>
                      <option value="BarChart3">📈 실시간 반응 차트 (Mentimeter 등)</option>
                      <option value="Palette">🎨 드로잉 및 디자인 (Canva 등)</option>
                      <option value="Search">🔍 웹 검색 및 크롤링 (Perplexity 등)</option>
                      <option value="GraduationCap">🎓 교육 학습 관리 (Google Classroom 등)</option>
                      <option value="BookOpen">📖 독서 및 학습 가이드</option>
                      <option value="Wrench">🔧 다목적 보조 렌치</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>새 웹툴 등록하기</span>
                </button>
              </form>
            )}

            {/* EDIT TEACHER INFO SCREEN */}
            {modalType === 'editTeacher' && (
              <form onSubmit={handleTeacherSubmit}>
                <h2 className="text-xl font-extrabold text-slate-800 mb-1">교사 인적사항 수정</h2>
                <p className="text-xs text-slate-500 mb-6">메인 헤더 배너에 표시될 학교명과 본인의 이름, 과목을 자유롭게 수정해 보세요.</p>

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">소속 학교명</label>
                    <input
                      type="text"
                      required
                      value={tempSchool}
                      onChange={(e) => setTempSchool(e.target.value)}
                      placeholder="예: 창원여자고등학교"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">담당 과목 / 보직</label>
                    <input
                      type="text"
                      required
                      value={tempSubject}
                      onChange={(e) => setTempSubject(e.target.value)}
                      placeholder="예: 수학교사, 3학년부장"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold text-slate-700 mb-1">교사 성함</label>
                    <input
                      type="text"
                      required
                      value={tempName}
                      onChange={(e) => setTempName(e.target.value)}
                      placeholder="예: KIM"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                >
                  정보 저장하기
                </button>
              </form>
            )}

            {/* CONFIRM DELETE SCREEN */}
            {modalType === 'delete' && (
              <div>
                <div className="p-3 bg-red-50 text-red-600 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <h2 className="text-xl font-extrabold text-slate-800 mb-1">도구를 삭제할까요?</h2>
                <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                  선택하신 <strong className="text-red-600">[{pendingDeleteName}]</strong> 웹툴이 이 포털 목록에서 제거됩니다. 정말 진행하시겠습니까?
                </p>

                <div className="flex space-x-3">
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    삭제하기
                  </button>
                </div>
              </div>
            )}

            {/* ACTION SUCCESS ADD ALERT SCREEN */}
            {modalType === 'successAdd' && (
              <div className="text-center py-4">
                <div className="mx-auto p-3 bg-emerald-50 text-emerald-600 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-1">등록 완료!</h3>
                <p className="text-xs text-slate-500">새로운 도구가 성공적으로 보드에 추가되었습니다.</p>
              </div>
            )}

            {/* ACTION SUCCESS DEL ALERT SCREEN */}
            {modalType === 'successDel' && (
              <div className="text-center py-4">
                <div className="mx-auto p-3 bg-red-50 text-red-600 rounded-full w-12 h-12 flex items-center justify-center mb-4">
                  <XCircle className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-1">삭제 완료!</h3>
                <p className="text-xs text-slate-500">도구가 리스트에서 즉시 정상 제거되었습니다.</p>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
