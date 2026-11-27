/* Bounded startup trace for long tasks, animation frames and named boot phases. */
(function installStartupPerformanceObserver(root){
 'use strict';
 if(root.__ELSN_STARTUP_PERF__)return;
 const LIMIT=120,events={longTasks:[],longAnimationFrames:[],marks:[],measures:[]};
 const support={longtask:false,longAnimationFrame:false,observerErrors:[]};
 let sequence=0;
 const trim=list=>{if(list.length>LIMIT)list.splice(0,list.length-LIMIT);};
 const clean=value=>String(value==null?'':value).slice(0,220);
 const push=(list,item)=>{list.push(item);trim(list);};
 const now=()=>Number(performance.now().toFixed(2));
 function observe(type, target, mapper){
  if(typeof PerformanceObserver!=='function')return;
  try{
   if(Array.isArray(PerformanceObserver.supportedEntryTypes)&&!PerformanceObserver.supportedEntryTypes.includes(type))return;
   const observer=new PerformanceObserver(list=>{
    for(const entry of list.getEntries()){
     try{push(target,mapper(entry));}catch(_){}
    }
   });
   observer.observe({type,buffered:true});
   support[type==='longtask'?'longtask':'longAnimationFrame']=true;
  }catch(error){support.observerErrors.push({type,error:clean(error&&error.message||error)});}
 }
 observe('longtask',events.longTasks,entry=>({
  startTime:Number(entry.startTime.toFixed(2)),duration:Number(entry.duration.toFixed(2)),
  name:clean(entry.name),attribution:(entry.attribution||[]).slice(0,8).map(item=>({
   name:clean(item.name),containerType:clean(item.containerType),containerName:clean(item.containerName),
   containerId:clean(item.containerId),containerSrc:clean(item.containerSrc)
  }))
 }));
 observe('long-animation-frame',events.longAnimationFrames,entry=>({
  startTime:Number(entry.startTime.toFixed(2)),duration:Number(entry.duration.toFixed(2)),
  renderStart:Number(entry.renderStart||0),styleAndLayoutStart:Number(entry.styleAndLayoutStart||0),
  firstUIEventTimestamp:Number(entry.firstUIEventTimestamp||0),blockingDuration:Number(entry.blockingDuration||0),
  scripts:(entry.scripts||[]).slice(0,12).map(script=>({
   invoker:clean(script.invoker),invokerType:clean(script.invokerType),
   sourceURL:clean(script.sourceURL),sourceFunctionName:clean(script.sourceFunctionName),
   executionStart:Number(script.executionStart||0),duration:Number(script.duration||0),
   forcedStyleAndLayoutDuration:Number(script.forcedStyleAndLayoutDuration||0)
  }))
 }));
 function mark(name,detail={}){
  const id=++sequence,label='elsn:'+clean(name).replace(/[^a-zA-Z0-9_.:-]/g,'_')+':'+id;
  try{performance.mark(label);}catch(_){}
  push(events.marks,{id,name:clean(name),at:now(),detail:detail&&typeof detail==='object'?detail:{value:clean(detail)}});
  return {id,label,name:clean(name),startedAt:performance.now()};
 }
 function end(token,detail={}){
  if(!token||!Number.isFinite(token.startedAt))return null;
  const endedAt=performance.now(),duration=Number((endedAt-token.startedAt).toFixed(2));
  const endLabel=token.label+':end';
  try{performance.mark(endLabel);performance.measure(token.label,token.label,endLabel);}catch(_){}
  push(events.measures,{id:token.id,name:token.name,startTime:Number(token.startedAt.toFixed(2)),
   endTime:Number(endedAt.toFixed(2)),duration,detail:detail&&typeof detail==='object'?detail:{value:clean(detail)}});
  return duration;
 }
 function track(name,work,detail={}){
  const token=mark(name,{...detail,phase:'start'});
  let result;
  try{result=typeof work==='function'?work():work;}
  catch(error){end(token,{...detail,status:'throw',error:clean(error&&error.message||error)});throw error;}
  return Promise.resolve(result).then(value=>{end(token,{...detail,status:'ready'});return value;},error=>{
   end(token,{...detail,status:'failed',error:clean(error&&error.message||error)});throw error;
  });
 }
 function snapshot(){
  return {
   schema:1,startedAt:performance.timeOrigin,observedAt:now(),
   support:{...support,observerErrors:support.observerErrors.slice()},
   longTasks:events.longTasks.slice(),longAnimationFrames:events.longAnimationFrames.slice(),
   marks:events.marks.slice(),measures:events.measures.slice(),
   peaks:{
    longTaskMs:events.longTasks.reduce((peak,item)=>Math.max(peak,item.duration),0),
    longAnimationFrameMs:events.longAnimationFrames.reduce((peak,item)=>Math.max(peak,item.duration),0)
   }
  };
 }
 root.__ELSN_STARTUP_PERF__=Object.freeze({mark,begin:mark,end,track,snapshot});
})(window);
