const T=require(process.argv[2]+"/trainTiming.js");let ok=0,bad=0;const eq=(n,c)=>{c?ok++:(bad++,console.log("FAIL",n))};
eq("sec",T.etaOf({code:99,sec:200,msg:""})===200);
eq("전역출발",T.etaOf({code:3,sec:0,msg:"전역 출발"})===90);
eq("분초",T.etaOf({code:99,sec:0,msg:"3분 20초 후 (강남)"})===200);
eq("n번째",T.etaOf({code:99,sec:0,msg:"[4]번째 전역 (사당)"})===480);
eq("stops",T.etaOf({code:99,sec:0,msg:"",stopsAway:3})===360);
// 막 출발(-30), 1분 뒤, 8분 뒤(앞차와 7분), 10분 뒤(앞차와 2분 = 붙어옴)
const tr=[{trainNo:"5238",terminal:"A",eta:-30,express:false,last:false},{trainNo:"5240",terminal:"A",eta:60,express:false,last:false},{trainNo:"5242",terminal:"A",eta:300,express:false,last:false},{trainNo:"5244",terminal:"A",eta:420,express:false,last:false}];
const p=T.planTrains(tr,0.5);console.log(p.list.map(x=>`${x.order}:${x.trainNo} eta${x.eta} gap${x.gap} ${x.prob}`).join(" | "),"best",p.best&&p.best.trainNo,"typ",p.typicalGap);
eq("3대",p.list.length===3); eq("붙어온 5244 추천",p.best.trainNo==="5244"); eq("막출발 제외",!p.list.some(x=>x.eta<0));
const q=T.planTrains([{trainNo:"1",terminal:"A",eta:30,express:false,last:false},{trainNo:"2",terminal:"A",eta:330,express:false,last:false}],0.5);
eq("2분 안 열차 추천 안 함",q.best.trainNo==="2");
console.log(`통과 ${ok}, 실패 ${bad}`);
