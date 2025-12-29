
# 🚗 모두의카풀 (Modu Carpool)

운전자와 탑승자를 잇는 스마트 카풀 매칭 및 데이터 수집 플랫폼입니다.

## ✨ 주요 기능
- **운전자 등록**: 자신의 차량 정보와 운행 스케줄 등록 (Gemini AI 프로필 요약 포함)
- **탑승자 신청**: 출발/도착지 설정 및 예상 택시비 확인 기능
- **AI 요약**: Gemini 3 Flash 모델을 활용한 신뢰감 있는 한 줄 자기소개 생성
- **관리자 포털**: 수집된 데이터를 한눈에 확인하고 CSV로 추출 가능 (비밀번호: `0928`)

## 🛠 기술 스택
- **Frontend**: React 19, Tailwind CSS, Lucide Icons
- **Routing**: React Router Dom (HashRouter)
- **AI Integration**: Google Gemini API (@google/genai)
- **Data Store**: LocalStorage (현재 버전)

## 🚀 배포 가이드 (Vercel)
1. GitHub 저장소에 코드를 업로드합니다.
2. Vercel에서 프로젝트를 연결합니다.
3. **Environment Variables** 설정에서 `API_KEY` 항목을 만들고 자신의 Gemini API Key를 입력합니다.
4. 배포 완료 후 제공되는 도메인으로 접속합니다.

---
© 2024 Modu Carpool.
