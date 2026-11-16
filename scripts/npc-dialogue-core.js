(function(root,factory){
 "use strict";
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.ELSN_NPC_DIALOGUE_CORE=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
"use strict";
const MAX_VISIBLE_BUBBLES=4,MAX_RANGE_METERS=26,POSITION_UPDATE_MS=100,SCHEDULER_INTERVAL_MS=1200;
const ROLES=Object.freeze([
 Object.freeze({id:"fisher",name:"Pescador",focus:"mareas, redes, corrientes y calas",thoughts:["La marea está cambiando; habrá que revisar las redes.","El mar siempre encuentra la forma de sorprendernos.","La corriente trae algas. Mañana tendré que remendar una red."],speech:["Hoy las redes pesan poco.","Cuando cambie el viento, saldré a pescar.","Necesitamos más cuerda para las redes.","La cala del norte suele quedar protegida cuando sopla del oeste."]}),
 Object.freeze({id:"farmer",name:"Campesino",focus:"cosechas, agua, alimentos y reservas",thoughts:["La tierra necesita cuidados antes de la próxima cosecha.","No podemos desperdiciar ni una sola provisión.","La lluvia ha dejado la tierra blanda; habrá que esperar para cargar los sacos."],speech:["Hoy toca revisar los cultivos.","La cosecha saldrá adelante si cuidamos la tierra.","Las provisiones deben durar hasta la próxima estación.","He guardado semillas para la siguiente siembra."]}),
 Object.freeze({id:"smith",name:"Herrero",focus:"hierro, herramientas, reparaciones y defensas",thoughts:["Una buena hoja necesita paciencia y buen fuego.","El hierro de esta isla exige un trabajo cuidadoso.","El martillo empieza a pesar. Haré una pausa antes de templar la hoja."],speech:["La fragua necesita más carbón.","Me vendría bien recibir más mineral.","Cada herramienta debe aguantar muchos inviernos.","Una empuñadura firme evita que la hoja se vuelva contra quien la usa."]}),
 Object.freeze({id:"trader",name:"Mercader",focus:"intercambios, rutas, noticias y provisiones",thoughts:["Los rumores viajan más rápido que los barcos.","Conviene guardar algo para los días difíciles.","Cada puerto tiene un precio distinto; hay que saber preguntar."],speech:["Siempre hay algo que intercambiar en otra isla.","Ojalá llegue pronto un barco mercante.","Una ruta segura puede traer noticias y provisiones.","No todo lo valioso se paga con plata; a veces basta una promesa."]})
]);
const OPENERS=["¿Has oído algo nuevo de la costa?","¿Cómo marcha el trabajo hoy?","¿Crees que tendremos una travesía tranquila?","¿Has visto al resto del poblado esta mañana?","¿Qué tal ha pasado la noche tu familia?"];
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number(n)||0));
function rand(r){const n=typeof r==="function"?Number(r()):Math.random();return Number.isFinite(n)?Math.max(0,Math.min(.999999,n)):.5;}
function choose(a,r){return a[Math.floor(rand(r)*a.length)];}
function roleForVariant(v){return ROLES[Math.abs(Math.floor(Number(v)||0))%ROLES.length];}
function hashText(value){let h=2166136261;for(const ch of String(value||"")){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function personalityFor(npc){const p=npc&&npc.parts?npc.parts:(npc||{}),name=p.name||npc&&npc.name||"",types=["sereno","curioso","prudente","alegre"];return types[hashText(name)%types.length];}
function hasMeasuredNumber(value){return value!==null&&value!==undefined&&value!==""&&Number.isFinite(Number(value));}
function contextualLines(role,ctx){
 const lines=[],island=ctx.islandName?String(ctx.islandName).slice(0,34):"";
 if(ctx.enemyNearby===true)lines.push({topic:"danger",kind:"speech",text:role.id==="fisher"?"¡Hay saqueadores cerca de la costa! No te quedes junto a las redes.":"¡He visto enemigos junto a la empalizada! ¿Has avisado a la guardia?"});
 if(ctx.healthLow===true)lines.push({topic:"health",kind:"speech",text:"Tienes mala cara y apenas te sostienes. Busca un lugar seguro; aquí no hace falta demostrar nada."});
 if(ctx.night===true)lines.push({topic:"night",kind:"speech",text:role.id==="farmer"?"La luz se va. Guardaré las herramientas y dejaré agua junto al fuego.":role.id==="fisher"?"No saldría a navegar con esta oscuridad; las rocas no avisan antes de abrir el casco.":"La noche cubre los caminos. Cerremos la empalizada y organicemos los turnos."});
 if(ctx.onShip===true)lines.push({topic:"voyage",kind:"speech",text:role.id==="fisher"?"Vigila el viento y los bajíos. Una ola de través puede llenar la cubierta.":role.id==="trader"?"Cada isla guarda algo distinto. Primero encontremos una cala segura y después hablaremos de carga.":"Asegura las herramientas antes de zarpar; una pieza suelta puede perderse en el mar."});
 if(hasMeasuredNumber(ctx.wood)&&Number(ctx.wood)<=5)lines.push({topic:"wood",kind:"speech",text:role.id==="smith"?"Queda poca madera para mangos y defensas. No quiero desperdiciar ni una tabla.":"Las reservas de madera están casi agotadas. Conviene organizar una salida antes de que falte para reparar."});
 if(hasMeasuredNumber(ctx.stone)&&Number(ctx.stone)<=5)lines.push({topic:"stone",kind:"speech",text:role.id==="smith"?"Nos falta piedra para reforzar el equipo. Busca granito firme, no piedras sueltas de la orilla.":"Queda poca piedra. Los bloques de granito pueden servir para asegurar los cimientos."});
 if(ctx.weather&&/storm|torment|rain|lluv|fog|niebl|wind|viento/i.test(String(ctx.weather)))lines.push({topic:"weather",kind:"speech",text:role.id==="fisher"?"Con este tiempo dejaré las redes recogidas; no merece la pena perderlas por una racha.":role.id==="farmer"?"La lluvia ayudará a la tierra, pero revisa los tejados antes de que arrecie.":"El viento está cambiando. Aseguremos puertas, herramientas y cualquier cosa que pueda salir volando."});
 if(hasMeasuredNumber(ctx.daylight)&&Number(ctx.daylight)>.72&&ctx.night!==true)lines.push({topic:"daylight",kind:"thought",text:role.id==="fisher"?"La luz aguanta unas horas más. Aprovecharé para secar las redes.":role.id==="farmer"?"Todavía hay luz para terminar la tarea antes de volver al poblado.":"Con buena luz se ve mejor el trabajo. Mejor acabar ahora que hacerlo a tientas."});
 if(ctx.playerClose===true)lines.push({topic:"greeting",kind:"speech",text:role.id==="trader"?"¡Eh, viajero! ¿Traes noticias de otras islas o vienes buscando provisiones?":role.id==="fisher"?"¡Buen día! ¿Has visto cómo está el mar más allá de la cala?":"Me alegra verte. ¿Cómo marcha la expedición? ¿Necesitas algo?"});
 if(ctx.recentCapture===true)lines.push({topic:"victory",kind:"speech",text:"La bandera vuelve a ondear sobre "+(island||"esta aldea")+". Ahora toca demostrar que sabemos cuidar lo que hemos ganado."});
 if(ctx.friendNearby===true)lines.push({topic:"company",kind:"speech",text:"Hace bien trabajar con alguien cerca. Se hace más llevadero cuando podemos repartir las tareas."});
 return lines;
}
function voice(text,personality,kind){
 const value=String(text||"");
 if(personality==="curioso"&&kind==="speech"&&!/[¿?]/.test(value))return value+" ¿Tú qué opinas?";
 if(personality==="prudente"&&kind==="speech"&&!/cuidado|mejor|conviene|seguro/i.test(value))return value+" Más vale no precipitarse.";
 if(personality==="alegre"&&kind==="speech"&&!/[¡!]/.test(value))return value+" ¡Todavía podemos arreglarlo!";
 return value;
}
function chooseAmbientMessage(npc,context,random,memory){
 const p=npc&&npc.parts?npc.parts:(npc||{}),role=roleForVariant(p.variant??npc?.variant),ctx=context||{},mem=memory||{},personality=personalityFor(npc);
 const contextual=contextualLines(role,ctx),recent=new Set(Array.isArray(mem.recentTopics)?mem.recentTopics:[]);
 const fresh=contextual.filter(x=>!recent.has(x.topic));
 let selected=null;
 if(fresh.length&&rand(random)<((ctx.enemyNearby||ctx.healthLow||ctx.night||ctx.onShip)?0.92:0.80))selected=choose(fresh,random);
 if(!selected&&ctx.isWalking===true&&rand(random)<.26)selected={topic:"work",kind:"action",text:role.id==="farmer"?"Revisa el terreno y comprueba que el camino esté despejado.":role.id==="smith"?"Vuelve a la fragua; todavía queda trabajo por hacer.":role.id==="fisher"?"Lleva las redes a secar y revisa los nudos antes de guardarlas.":"Continúa con tu tarea y pregunta al resto si necesitan algo."};
 if(!selected)selected={topic:"daily-"+role.id,kind:rand(random)<.24?"thought":"speech",text:choose(rand(random)<.48?role.thoughts:role.speech,random)};
 return{kind:selected.kind,topic:selected.topic,roleId:role.id,roleName:role.name,personality,text:voice(selected.text,personality,selected.kind)};
}
function buildConversation(topic,a,b,ctx,random,memory){
 const island=ctx.islandName?(" en "+String(ctx.islandName).slice(0,28)):"",rapport=clamp(memory&&memory.rapport||0,0,5),friendly=rapport>=2;
 const line=(role,text)=>({kind:"speech",topic,roleId:role.id,roleName:role.name,text:String(text).slice(0,120)});
 const close=friendly?"Te conozco; sé que no abandonarás a los nuestros.":"Aún tendremos que demostrar que podemos confiar el uno en el otro.";
 if(topic==="danger")return[
  line(a,a.id==="fisher"?"He visto movimiento junto a la costa. No eran pescadores; llevaban armas.":"Hay enemigos cerca de la empalizada. ¿Has dado la voz de alarma?"),
  line(b,b.id==="trader"?"Vi sus huellas junto al camino. Avisaré al poblado y cerraré el paso del norte.":b.id==="smith"?"Sí. He dejado el hierro enfriando; llevaré herramientas y reforzaré la entrada.":"Los he visto. Iré a buscar a la guardia; nadie debe quedarse fuera."),
  line(a,"No salgamos a perseguirlos sin saber cuántos son. Mantengamos a la gente dentro."),
  line(b,friendly?"De acuerdo. Yo cubriré el flanco; confío en que vigiles la otra entrada.":"Tienes razón. Primero protegeremos a los vecinos y después pensaremos en perseguirlos.")
 ];
 if(topic==="health")return[
  line(a,"Ese golpe ha sido serio. Te tiembla el brazo; ¿puedes respirar bien?"),
  line(b,b.id==="farmer"?"Prepararé agua y algo de comida. No puedes seguir trabajando así.":"Buscaré un sitio junto al fuego. Primero hay que parar la hemorragia y después descansar."),
  line(a,"No tienes que volver a luchar ahora. Los demás podemos encargarnos de la guardia."),
  line(b,"Gracias. Cuando recupere las fuerzas ayudaré de nuevo; no pienso dejaros solos.")
 ];
 if(topic==="night")return[
  line(a,a.id==="farmer"?"La luz está cayendo. ¿Quién se encarga del fuego y de cerrar el cobertizo?":"La noche se ha cerrado sobre el poblado. ¿Has revisado la empalizada?"),
  line(b,b.id==="fisher"?"Dejaré las redes y ayudaré con la guardia. La costa puede esperar hasta el amanecer.":b.id==="smith"?"Yo revisaré las defensas; el fuego debe mantenerse encendido.":"Haré el primer turno. Despiértame cuando llegue el relevo."),
  line(a,"Mañana habrá que revisar las provisiones y reparar lo que se haya soltado durante la noche."),
  line(b,friendly?"Descansa un poco. Yo me quedaré cerca; no hace falta que cargues con todo.":"De acuerdo. Mantengamos el poblado seguro hasta el amanecer.")
 ];
 if(topic==="voyage")return[
  line(a,"¿Qué ruta tomarías para llegar a la siguiente isla sin arriesgar el barco?"),
  line(b,b.id==="fisher"?"Sigamos la costa y evitemos los bajíos cuando cambie la marea.":b.id==="trader"?"Primero busquemos una cala protegida; después podremos comerciar con el poblado.":"Conviene reparar el casco y asegurar las herramientas antes de zarpar."),
  line(a,"También necesitamos agua y espacio para traer madera. No quiero volver con la bodega vacía."),
  line(b,"Revisaré la carga y el viento. Cuando todo esté sujeto, podremos partir sin improvisar.")
 ];
 if(topic==="resources"||topic==="wood"||topic==="stone")return[
  line(a,a.id==="smith"?"Nos falta material para reparar el equipo. ¿Qué podemos conseguir primero?":"Las reservas están bajando. ¿Cómo organizamos el trabajo?"),
  line(b,b.id==="fisher"?"Puedo traer pescado para cambiarlo por madera y piedra.":b.id==="farmer"?"Prioricemos comida y madera; sin reservas no aguantaremos el invierno.":b.id==="smith"?"Separaré el mineral útil de los restos; no conviene fundirlo todo junto.":"Puedo organizar un intercambio en la próxima ruta, pero necesitaremos escolta."),
  line(a,ctx.wood<=5?"La madera no puede esperar; cada reparación consume más de lo que parece.":ctx.stone<=5?"La piedra será lo primero. Sin buenos cimientos, cualquier defensa acabará cediendo.":"Repartamos las tareas y anotemos lo que falta antes de salir."),
  line(b,"De acuerdo. Cuando volvamos, contaremos las reservas y decidiremos qué conviene construir primero.")
 ];
 if(topic==="weather")return[
  line(a,"El tiempo está cambiando. ¿Has asegurado lo que dejaste fuera?"),
  line(b,b.id==="fisher"?"He recogido las redes y amarrado las barcas. No quiero perder otra con el viento.":b.id==="farmer"?"He cubierto los sacos y limpiado el canal. Si llueve más, el agua buscará otro camino.":"He guardado las herramientas y reforzado la puerta del taller."),
  line(a,"Después de que pase, tendremos que revisar tejados, amarres y caminos."),
  line(b,"Lo haré al amanecer. Prefiero prevenir ahora que reconstruirlo todo mañana.")
 ];
 if(topic==="capture")return[
  line(a,"La bandera ya ondea"+island+". ¿Crees que podremos mantener este asentamiento?"),
  line(b,b.id==="smith"?"Reforzaremos la empalizada y repararemos las herramientas antes de que vuelva el enemigo.":b.id==="farmer"?"Sí, si aseguramos agua y alimentos antes de que llegue el frío.":"Sí, pero habrá que abrir una ruta segura para traer provisiones."),
  line(a,"La victoria no sirve de mucho si la gente pasa hambre o duerme con miedo."),
  line(b,"Entonces empecemos por las defensas y las reservas. Esta aldea también es responsabilidad nuestra.")
 ];
 if(topic==="work")return[
  line(a,"¿Cómo va tu tarea? Te he visto cruzar el poblado varias veces."),
  line(b,b.id==="fisher"?"Las redes están listas; después puedo ayudar con el transporte.":b.id==="farmer"?"Voy a terminar aquí y luego revisaré las reservas.":b.id==="smith"?"Las herramientas estarán listas cuando termine de templar el hierro.":"Estoy organizando los materiales para que nadie tenga que esperar."),
  line(a,"Cuando acabes, avisa al resto. Si repartimos el trabajo, nadie tendrá que hacerlo todo."),
  line(b,friendly?"Lo haré. Contigo es más fácil coordinarse; ya sabemos cómo trabaja cada uno.":"Lo haré. Todavía estamos aprendiendo a trabajar juntos, pero vamos por buen camino.")
 ];
 if(topic==="company")return[
  line(a,"Llevamos un buen rato sin hablar. ¿Cómo te está tratando el trabajo?"),
  line(b,"Cansa, pero peor sería hacerlo todo en silencio. Al menos aquí nos conocemos."),
  line(a,friendly?"Me alegra que estés aquí. Tu ayuda se nota más de lo que crees.":"Aún nos queda mucho por aprender unos de otros."),
  line(b,"Cuando terminemos, podemos sentarnos junto al fuego y contarnos lo que hemos visto.")
 ];
 if(topic==="daylight")return[
  line(a,"Todavía queda luz. ¿Vas a terminar tu tarea o volverás al poblado?"),
  line(b,b.id==="fisher"?"Secaré las redes antes de que caiga el rocío. Mañana las necesitaremos.":b.id==="farmer"?"Quiero dejar preparado el terreno para la próxima jornada.":"Aprovecharé la luz para revisar las herramientas una vez más."),
  line(a,"No te entretengas demasiado. El camino cambia mucho cuando oscurece."),
  line(b,"Lo sé. Terminaré esto y regresaré antes de que se apaguen las últimas brasas.")
 ];
 return[
  line(a,choose(OPENERS,random)),
  line(b,b.id==="fisher"?"El viento está cambiando; mejor revisar las redes antes de que suba la marea.":b.id==="farmer"?"Con buenas reservas, el poblado puede pasar el invierno.":b.id==="smith"?"Una herramienta bien hecha ahorra muchos problemas.":"Las noticias de otras islas pueden valer tanto como el oro."),
  line(a,"A veces pensamos solo en la tarea que tenemos delante y olvidamos cómo afecta al resto del poblado."),
  line(b,friendly?"Por eso me gusta hablar contigo. Nos entendemos mejor cada día.":close)
 ];
}
function chooseExchange(aNpc,bNpc,random,context,memory){
 const a=roleForVariant(aNpc&&aNpc.parts?aNpc.parts.variant:aNpc?.variant),b=roleForVariant(bNpc&&bNpc.parts?bNpc.parts.variant:bNpc?.variant),ctx=context||{},mem=memory||{};
 const candidates=[];
 if(ctx.enemyNearby===true)candidates.push("danger");
 if(ctx.healthLow===true)candidates.push("health");
 if(ctx.recentCapture===true)candidates.push("capture");
 if(ctx.night===true)candidates.push("night");
 if(ctx.onShip===true)candidates.push("voyage");
 if(ctx.weather&&/storm|torment|rain|lluv|fog|niebl|wind|viento/i.test(String(ctx.weather)))candidates.push("weather");
 if((hasMeasuredNumber(ctx.wood)&&Number(ctx.wood)<=5)||(hasMeasuredNumber(ctx.stone)&&Number(ctx.stone)<=5))candidates.push("resources");
 if(ctx.friendNearby===true)candidates.push("company");
 if(hasMeasuredNumber(ctx.daylight)&&Number(ctx.daylight)>.72)candidates.push("daylight");
 if(ctx.isWalking===true)candidates.push("work");
 candidates.push("village");
 const recent=new Set(Array.isArray(mem.recentTopics)?mem.recentTopics:[]);
 const topic=candidates.find(value=>!recent.has(value))||candidates[candidates.length-1];
 return buildConversation(topic,a,b,ctx,random,mem);
}
function selectVisibleBubbles(items,limitValue){const requested=Number.isFinite(Number(limitValue))?Math.floor(Number(limitValue)):MAX_VISIBLE_BUBBLES,limit=Math.max(0,Math.min(MAX_VISIBLE_BUBBLES,requested));if(!Array.isArray(items)||!limit)return[];return items.filter(x=>x&&x.visible!==false&&Number.isFinite(Number(x.distance))&&Number(x.distance)<=MAX_RANGE_METERS).slice().sort((a,b)=>(Number(b.priority)||0)-(Number(a.priority)||0)||Number(a.distance)-Number(b.distance)).slice(0,limit);}
function placeBubble(anchor,size,bounds,occupied){
 const x=Number(anchor&&anchor.x),y=Number(anchor&&anchor.y),w=Number(size&&size.width),h=Number(size&&size.height);
 const left=Number(bounds&&bounds.left),top=Number(bounds&&bounds.top),right=Number(bounds&&bounds.right),bottom=Number(bounds&&bounds.bottom);
 if(![x,y,w,h,left,top,right,bottom].every(Number.isFinite)||w<=0||h<=0||right-left<w+12||bottom-top<h+12)return null;
 const minLeft=left+6,maxLeft=right-w-6,minTop=top+6,maxTop=bottom-h-6,gap=12;
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const raw=[{left:x-w/2,top:y-h-gap},{left:x+gap,top:y-h/2},{left:x-w-gap,top:y-h/2},{left:x-w/2,top:y+gap},{left:x-w/2,top:y-(h*2)-gap},{left:x+w/2+gap,top:y-h-gap},{left:x-w/2-w-gap,top:y-h-gap}];
 const seen=new Set(),others=Array.isArray(occupied)?occupied:[];
 let best=null,bestScore=Infinity;
 for(const candidate of raw){
  const l=clamp(candidate.left,minLeft,maxLeft),t=clamp(candidate.top,minTop,maxTop),key=Math.round(l)+":"+Math.round(t);
  if(seen.has(key))continue;seen.add(key);
  let overlap=0;
  for(const other of others){if(!other)continue;const ix=Math.max(0,Math.min(l+w,Number(other.right)+8)-Math.max(l,Number(other.left)-8));const iy=Math.max(0,Math.min(t+h,Number(other.bottom)+8)-Math.max(t,Number(other.top)-8));overlap+=ix*iy;}
  const score=overlap/(w*h);if(score<bestScore){bestScore=score;best={left:l,top:t,right:l+w,bottom:t+h,width:w,height:h};}if(score===0)break;
 }
 return best&&bestScore===0?Object.freeze(best):null;
}
return Object.freeze({MAX_VISIBLE_BUBBLES,placeBubble,MAX_RANGE_METERS,POSITION_UPDATE_MS,SCHEDULER_INTERVAL_MS,ROLES,roleForVariant,personalityFor,chooseAmbientMessage,chooseExchange,selectVisibleBubbles,contextualLines});
});