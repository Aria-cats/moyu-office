/* A little painted kitchen. All motion is sampled from progress, including the steam. */
(function () {
  "use strict";

  const TAU = Math.PI * 2;
  const paths = new Map();
  const menus = {
    "红烧": { back: "#f7e7ce", napkin: "#b66b54", rim: "#687f72", stock: "#97502c", oil: "#f1ad50", skin: ["#86502a", "#c38142", "#edbe77", "#a85d32"] },
    "清蒸": { back: "#e9eddc", napkin: "#779380", rim: "#497c78", stock: "#b99255", oil: "#edc973", skin: ["#8c9690", "#c6c7b6", "#f7ebcd", "#b7ae90"] },
    "剁椒": { back: "#f4e4d2", napkin: "#a36758", rim: "#637e91", stock: "#bc5d32", oil: "#ffad51", skin: ["#a1744e", "#ceac79", "#f4dbab", "#b79266"] }
  };

  function ramp(value, start, end) {
    const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
    return t * t * (3 - 2 * t);
  }

  function seed(index) {
    const v = Math.sin(index * 91.31 + 17.63) * 17351.23;
    return v - Math.floor(v);
  }

  function curve(ctx, data, fill, stroke, width = 1.4) {
    // Only fixed drawing templates enter this cache.
    if (!paths.has(data)) paths.set(data, new Path2D(data));
    const path = paths.get(data);
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(path); }
    return path;
  }

  function oval(ctx, x, y, rx, ry, fill, edge, line = 1, angle = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, angle, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = line; ctx.stroke(); }
  }

  function palette(ctx, top, bottom, colors) {
    const paint = ctx.createLinearGradient(0, top, 0, bottom);
    colors.forEach((color, i) => paint.addColorStop(i / (colors.length - 1), color));
    return paint;
  }

  function wash(ctx, x, y, sx, sy, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    halo.addColorStop(0, color);
    halo.addColorStop(1, "rgba(120,93,54,0)");
    oval(ctx, 0, 0, 1, 1, halo);
    ctx.restore();
  }

  function background(ctx, menu) {
    ctx.fillStyle = palette(ctx, 0, 355, ["#fff9eb", menu.back]);
    ctx.fillRect(0, 0, 680, 355);
    ctx.save();
    ctx.translate(604, 17);
    ctx.rotate(.34);
    ctx.fillStyle = "#fff8e9";
    ctx.fillRect(-27, -82, 175, 460);
    ctx.globalAlpha = .23;
    ctx.fillStyle = menu.napkin;
    for (let x = -22; x < 150; x += 22) ctx.fillRect(x, -82, 5, 460);
    for (let y = -74; y < 380; y += 22) ctx.fillRect(-27, y, 175, 4);
    ctx.restore();
    // Flecks in the paper are fixed, so there is no shimmer during playback.
    ctx.fillStyle = "#92754a20";
    for (let i = 0; i < 118; i++) {
      ctx.fillRect(seed(i) * 680, seed(i + 200) * 355, 1 + seed(i + 410) * 2.4, .8);
    }
  }

  function steam(ctx, x, y, spread, clock, opacity = .65) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const t = (clock + i * .24) % 1;
      ctx.globalAlpha = opacity * Math.sin(Math.PI * t);
      ctx.save();
      ctx.translate(x + (i - 1.5) * spread + Math.sin(t * TAU) * 4, y - 33 * t);
      ctx.scale(.75 + .35 * t, .75 + .75 * t);
      curve(ctx, "M0 0 C-16 -14 11 -20 3 -34 S-4 -45 1 -51", null, "#bfa977", 4.8);
      curve(ctx, "M0 0 C-16 -14 11 -20 3 -34 S-4 -45 1 -51", null, "#fff9dd", 3.3);
      ctx.restore();
    }
    ctx.restore();
  }

  function scallions(ctx, amount) {
    // Fine, curling ribbons laid lengthwise on a steamed fish.
    const greens = ["#417d49", "#66953d", "#9baa46", "#42764b", "#e3ca76", "#dc8960"];
    for (let i = 0; i < amount; i++) {
      ctx.save();
      ctx.translate((seed(i + 8) - .5) * 100, -9 + (seed(i + 20) - .5) * 30);
      ctx.rotate((seed(i + 41) - .5) * .95);
      ctx.scale(.43 + .64 * seed(i + 61), .5 + seed(i + 80));
      curve(ctx, "M-39 7 C-17 -3 -11 8 5 1 S32 -15 49 -6 C31 -12 19 -2 7 3 S-20 0 -39 10 Z", greens[i % greens.length]);
      ctx.restore();
    }
  }

  function pepper(ctx, x, y, size, number) {
    const reds = ["#a83424", "#c64527", "#dd5933", "#ec7951", "#b93829", "#e7643c"];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(seed(number + 11) * Math.PI);
    ctx.scale(size, size * (.7 + seed(number + 27) * .35));
    curve(ctx, "M-5 -3 Q-2 -6 3 -4 L6 -1 Q5 4 1 4 L-5 3 Q-7 0 -5 -3Z", reds[number % reds.length], "#913d283d", .65);
    curve(ctx, "M-3 -3 Q0 -5 3 -3", null, "#ffb285", 1.2);
    if (number % 4 === 0) oval(ctx, 0, 1, 1.5, .9, "#f6d897");
    ctx.restore();
  }

  function coriander(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, size);
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.rotate(i * .64 - .9);
      curve(ctx, "M0 6 Q5 -8 2 -24", null, "#527c49", 2);
      curve(ctx, "M2 -9 Q-6 -10 -9 -16 Q-13 -24 -6 -21 Q-11 -29 -4 -28 Q-6 -38 2 -31 Q9 -37 9 -29 Q17 -30 13 -23 Q20 -19 12 -15Z", i % 2 ? "#688d50" : "#476f44");
      curve(ctx, "M2 -10 L2 -27 M2 -20 L-5 -24 M3 -18 L10 -22", null, "#b2bb77", .9);
      ctx.restore();
    }
    ctx.restore();
  }

  function fish(ctx, x, y, scale, angle, dish, garnish = 1, seared = 1) {
    const menu = menus[dish];
    const colors = seared < .32 ? ["#6f837c", "#9aaea1", "#d7d2ac", "#a2a58c"] : menu.skin;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);
    const ink = seared < .32 ? "#677664" : dish === "红烧" ? "#794625" : "#877a60";
    curve(ctx, "M-88 -8 C-110 -12 -133 -26 -147 -31 C-142 -12 -132 -4 -135 2 Q-141 17 -146 31 Q-116 27 -88 12Z", palette(ctx,-32,32,[colors[0],colors[2],colors[0]]), ink, 1.7);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(-94, 1); ctx.quadraticCurveTo(-124, i*8-17, -139, i*12-24);
      ctx.strokeStyle="#7b663f77"; ctx.lineWidth=1; ctx.stroke();
    }
    curve(ctx, "M-66 -23 Q-30 -54 -2 -49 Q-4 -44 12 -43 L43 -29Z", colors[0], ink, 1.2);
    curve(ctx, "M-44 25 Q-24 45 9 42 L19 26Z", colors[0], ink, 1.3);
    const body = curve(ctx, "M-97 -4 C-71 -35 -27 -45 29 -37 C70 -33 90 -22 106 -14 Q120 -6 126 -2 L121 2 Q126 3 122 6 C97 26 71 35 23 38 C-32 42 -78 28 -97 6Z", palette(ctx,-42,40,colors), ink, 2.1);
    ctx.save();
    ctx.clip(body);
    for (let i=0; i<66; i++) {
      const px=seed(i+14)*192-92, py=seed(i+93)*67-34;
      const r=2.2+seed(i+172)*2.3;
      ctx.beginPath(); ctx.arc(px,py,r,.08,2.58);
      ctx.strokeStyle = (i%3) ? "#fff2ca4d" : "#735e4329"; ctx.lineWidth=1.2; ctx.stroke();
    }
    if (dish === "红烧" && seared > .3) {
      curve(ctx,"M-94 4 Q-66 -23 -35 -17 T22 -20 Q63 -25 84 -9 Q40 -19 12 -10 T-49 -7 Q-69 -8 -94 4Z","#95512689");
      curve(ctx,"M-65 -14 Q-43 -26 -21 -24 M4 -28 Q29 -27 42 -24",null,"#ffdc94c4",3);
    }
    for (let i=0; i<3; i++) {
      ctx.save(); ctx.translate(i*34-43, i===1 ? -1 : 1);
      curve(ctx,"M1 -22 Q-1 -9 -15 13 Q-5 12 6 -6 Q10 -16 8 -21Z", dish==="红烧" ? "#8f542c" : "#ab9f80");
      curve(ctx,"M4 -20 Q3 -9 -11 11 Q3 1 9 -18Z", dish==="红烧" ? "#efc385" : "#fff0cc");
      ctx.restore();
    }
    ctx.restore();
    curve(ctx,"M78 -23 Q63 -3 77 24 M83 -18 Q72 -4 82 17",null,ink,1.4);
    curve(ctx,"M55 8 Q37 30 16 34 Q29 17 43 6Z", colors[1], ink,1.35);
    curve(ctx,"M49 11 Q38 21 25 29",null,colors[2],1.4);
    oval(ctx,98,-8,5.1,4.6,"#f2d9a7",ink,1);
    oval(ctx,99,-8,2.8,2.7,"#544d39");
    oval(ctx,100,-9,1,1,"#fffbed");
    curve(ctx,"M110 5 Q118 7 122 3",null,ink,1.25);
    if (dish === "剁椒") {
      for (let i=0; i<Math.round(garnish*98); i++) {
        const px=seed(i+71)*153-75;
        const py=(seed(i+211)-.5)*47*Math.sqrt(1-(px/87)**2)-5;
        pepper(ctx,px,py,.62+seed(i+300)*.8,i);
      }
    }
    if (garnish > 0) scallions(ctx,Math.ceil(garnish*(dish==="清蒸" ? 21 : 6)));
    ctx.restore();
  }

  function platter(ctx, dish) {
    const menu = menus[dish];
    ctx.save();
    ctx.rotate(-.075);
    wash(ctx, 2, 30, 255, 94, "#6853354d");
    oval(ctx,0,6,231,96,"#bcbbaa","#aba896",2);
    oval(ctx,0,0,232,96,palette(ctx,-96,96,["#fffef2","#efeede","#fbf8e8"]),menu.rim,2.6);
    oval(ctx,0,-2,224,88,null,menu.rim,1.15);
    oval(ctx,0,-1,196,68,"#dddcc888","#b8c3af",1.2);
    oval(ctx,0,2,192,65,"#f8f3dc");
    for (let i=0; i<28; i++) {
      const a=i*TAU/28;
      const x=212*Math.cos(a), y=78*Math.sin(a);
      oval(ctx,x,y,4.8,1.4,menu.rim,null,0,a+.3);
    }
    oval(ctx,0,4,167,46,menu.stock);
    oval(ctx,-3,5,160,40,palette(ctx,-35,43,[menu.stock,menu.oil,menu.stock]));
    for (let i=0; i<21; i++) {
      const theta=seed(i+231)*TAU;
      const r=.57+seed(i+44)*.41;
      const x=158*Math.cos(theta)*r, y=42*Math.sin(theta)*r+4;
      oval(ctx,x,y,2+seed(i+19)*7,1.3+seed(i+22)*1.6,menu.oil);
    }
    fish(ctx,0,-6,1.27,0,dish);
    if (dish==="红烧") {
      for (let i=0; i<3; i++) {
        const x=-91+i*26, y=27+i%2*6;
        oval(ctx,x,y,9,4,"#a6ac62","#647d48",1,i*.35);
        oval(ctx,x,y,5,1.8,"#6e6338",null,0,i*.35);
      }
      coriander(ctx,65,-27,.81);
    } else if (dish==="剁椒") {
      for (let i=0; i<12; i++) pepper(ctx,(seed(i+241)-.5)*226,20+seed(i+131)*15,.7,i);
      coriander(ctx,99,-31,.75);
    } else {
      coriander(ctx,-100,-23,.72);
    }
    ctx.restore();
  }

  function fire(ctx, t) {
    wash(ctx,327,281,150,33,"#ed914959");
    for (let i=0; i<7; i++) {
      const x=246+i*25, h=26+10*Math.sin(18*t+i*1.8);
      ctx.save();
      ctx.translate(x,276);
      ctx.scale(.67+h/150,h/30);
      curve(ctx,"M-11 3 C-17 -8 -9 -15 -9 -20 Q-5 -17 -5 -12 Q2 -22 5 -34 Q16 -17 13 -4 Q9 9 -1 10 Q-9 10 -11 3Z","#e67b43");
      curve(ctx,"M-5 4 Q-6 -4 1 -14 Q7 -5 6 0 Q8 7 0 7Z","#ffd17b");
      ctx.restore();
    }
  }

  function wok(ctx, sauce, menu, t) {
    curve(ctx,"M128 -12 Q149 -30 198 -65 Q205 -69 210 -63 Q214 -56 204 -52 L148 -7Z","#69756a","#434e45",2.5);
    curve(ctx,"M170 -49 L222 -87 Q228 -90 234 -84 Q240 -77 234 -72 L184 -32Z","#ae7851","#624f3e",2);
    curve(ctx,"M181 -45 L224 -77",null,"#dfaa74",2);
    curve(ctx,"M-151 -16 Q-134 50 -67 72 Q-1 91 65 70 Q134 49 151 -16Z",palette(ctx,-20,80,["#748077","#475b56","#35463f"]),"#42554d",2);
    oval(ctx,0,-14,152,51,palette(ctx,-63,38,["#3e504a","#596a5d","#758273"]),"#939a81",3.1);
    oval(ctx,0,-13,142,44,null,"#a6ad941f",1.4);
    if (sauce>.01) {
      ctx.save();
      ctx.globalAlpha=sauce;
      oval(ctx,0,-11,124,34,palette(ctx,-45,24,[menu.stock,menu.oil,menu.stock]));
      for (let i=0; i<23; i++) {
        const a=seed(63+i)*TAU, r=.55+seed(i+52)*.44;
        const x=Math.cos(a)*117*r, y=Math.sin(a)*29*r-11;
        oval(ctx,x,y,1.8+2.6*(1+Math.sin(40*t+i)),1.8,menu.oil);
      }
      ctx.restore();
    }
  }

  function spatula(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x,y); ctx.rotate(angle);
    curve(ctx,"M-15 8 Q-10 -10 0 -16 L30 -8 Q36 -1 30 15 Q13 28 -8 25Z",palette(ctx,-20,26,["#b7bcb0","#e5dfca","#7e8d83"]),"#796e59",2);
    curve(ctx,"M16 -12 L77 -96",null,"#748579",6);
    curve(ctx,"M58 -70 L89 -111",null,"#856042",10);
    curve(ctx,"M60 -72 L87 -108",null,"#c59c65",4);
    ctx.restore();
  }

  function spoon(ctx,x,y,angle,liquid) {
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    curve(ctx,"M0 3 L58 -72",null,"#777863",6);
    curve(ctx,"M41 -49 L65 -81",null,"#aa734b",9);
    oval(ctx,0,4,26,14,"#bbc0a9","#687d70",2,.25);
    oval(ctx,-2,3,20,9,liquid,null,0,.25);
    ctx.restore();
  }

  function pour(ctx, originX, originY, endX, endY, t, color) {
    const strength=Math.sin(t*Math.PI);
    if (strength<=.01) return;
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=1+5*strength;
    ctx.beginPath(); ctx.moveTo(originX,originY);
    ctx.bezierCurveTo(originX+4,originY+18,endX+4,endY-28,endX,endY); ctx.stroke();
    ctx.strokeStyle="#ffe594b3"; ctx.lineWidth=1.3;
    ctx.stroke();
    for (let i=0;i<7;i++) {
      const a=seed(i+32)*TAU;
      const r=4+12*((t*3+seed(i+15))%1);
      oval(ctx,endX+Math.cos(a)*r,endY-4-Math.abs(Math.sin(a)*r),2.1,1.5,color);
    }
    ctx.restore();
  }

  function braise(ctx,p) {
    const menu=menus["红烧"];
    const drop=ramp(p,0,.22), sauce=ramp(p,.29,.48);
    const flip=Math.sin(Math.PI*ramp(p,.48,.7));
    fire(ctx,p);
    ctx.save();
    ctx.translate(319+flip*19,193-flip*8);
    ctx.rotate(-.15*flip);
    wok(ctx,.2+.8*sauce,menu,p);
    fish(ctx,-20+20*drop,-14-118*(1-drop)-54*flip,.78+.08*drop,-.2*(1-drop)+.16*flip,"红烧",ramp(p,.58,.74)*.65,drop);
    ctx.restore();
    if (p<.28 || p>.49) spatula(ctx,230+flip*16,193-13*flip,-.75+.27*flip);
    if (p>.22 && p<.53) {
      const t=ramp(p,.24,.5);
      spoon(ctx,391,72+.4*12*Math.sin(t*Math.PI),-.32-t*.23,menu.stock);
      pour(ctx,372,82,337,164,t,"#ac6031");
    }
    steam(ctx,327,151,27,p*2.1,.5*drop);
  }

  function bamboo(ctx) {
    curve(ctx,"M-145 -11 L-138 39 C-118 88 115 88 140 37 L145 -12Z",palette(ctx,-19,73,["#dfb970","#c99955","#e3b46e"]),"#986e43",2.2);
    for (let i=0;i<23;i++) {
      const a=(i+.5)*Math.PI/23;
      const x=141*Math.cos(a), dip=43*Math.sin(a);
      ctx.beginPath(); ctx.moveTo(x,dip-10); ctx.quadraticCurveTo(x+1,dip+10,x*.97,dip+35);
      ctx.strokeStyle=i%2 ? "#a77c49" : "#e8c58b"; ctx.lineWidth=1.6; ctx.stroke();
    }
    curve(ctx,"M-142 24 C-110 80 109 80 142 24 M-141 31 C-111 87 109 87 141 31",null,"#a77e49",2);
    oval(ctx,0,-11,146,51,"#ebc989","#9d7946",2.8);
    oval(ctx,0,-10,134,41,"#a58453","#f0d79c",2.4);
    oval(ctx,0,-9,127,37,"#f0eee0","#75968c",2);
  }

  function lid(ctx,x,y,angle) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    oval(ctx,0,3,149,48,"#b0834d","#916c43",2);
    oval(ctx,0,-4,148,48,palette(ctx,-52,44,["#f1d69e","#d6aa6e","#e8c58d"]),"#9d7748",2);
    ctx.save();
    ctx.beginPath();ctx.ellipse(0,-4,136,38,0,0,TAU);ctx.clip();
    for (let i=-20;i<=20;i++) {
      const start=i*13;
      ctx.beginPath();ctx.moveTo(start-70,-54);ctx.lineTo(start+59,48);
      ctx.strokeStyle="#ac824c";ctx.lineWidth=2.6;ctx.stroke();
      ctx.beginPath();ctx.moveTo(start+70,-54);ctx.lineTo(start-59,48);
      ctx.strokeStyle="#f5d89c";ctx.lineWidth=3.6;ctx.stroke();
    }
    ctx.restore();
    oval(ctx,0,-4,137,39,null,"#be985c",2.1);
    curve(ctx,"M-18 -9 C-20 -41 17 -41 19 -10",null,"#886942",7);
    curve(ctx,"M-17 -11 C-17 -35 14 -36 17 -12",null,"#ddba7e",3.3);
    ctx.restore();
  }

  function steamed(ctx,p) {
    const lift=ramp(p,.15,.46);
    ctx.save();ctx.translate(325,208);bamboo(ctx);
    fish(ctx,0,-14,.81,0,"清蒸",.4+.6*ramp(p,.37,.50));
    ctx.restore();
    steam(ctx,323,173,25,p*2.7,.42+.42*lift);
    ctx.save();
    ctx.globalAlpha=1-ramp(p,.43,.52);
    lid(ctx,325-97*lift,183-104*lift,-.26*lift);
    ctx.restore();
    if (p>.45) {
      const t=ramp(p,.48,.7);
      spoon(ctx,423,83,-.5-.2*t,"#e0b75e");
      pour(ctx,408,92,349,184,t,"#e3b45d");
    }
  }

  function wholeChili(ctx,x,y,angle) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    curve(ctx,"M-43 -6 C-16 -11 9 -10 23 -14 Q48 -24 55 -33 Q48 -12 26 -1 C2 13 -25 13 -41 5Z","#c7442d","#9d3f2a",1.5);
    curve(ctx,"M-25 -4 Q3 -2 24 -11",null,"#f68f68",2.6);
    curve(ctx,"M-35 -5 Q-47 -15 -52 -6 L-59 -11 Q-62 -13 -65 -10 Q-60 -9 -53 -2 Q-47 7 -37 6 L-41 1Z","#58734a");
    ctx.restore();
  }

  function chopping(ctx,p) {
    ctx.save();ctx.translate(317,204);ctx.rotate(-.08);
    wash(ctx,1,21,196,81,"#79613d57");
    curve(ctx,"M-174 -57 Q-169 -72 -149 -72 L148 -72 Q171 -72 176 -57 L183 48 Q186 66 162 69 L-153 69 Q-176 69 -178 53Z","#a97750","#9e734d",1.8);
    curve(ctx,"M-174 -61 Q-173 -78 -153 -79 L149 -79 Q169 -79 173 -63 L180 39 Q183 58 160 59 L-152 59 Q-174 60 -176 43Z",palette(ctx,-78,60,["#e1b980","#d5a873","#e8c08a"]),"#ae8156",1.4);
    ctx.save();ctx.globalAlpha=.36;
    for(let i=0;i<8;i++) {
      ctx.beginPath();ctx.moveTo(-150,-65+i*15);
      ctx.bezierCurveTo(-70,-50+i*14,67,-75+i*15,156,-60+i*15);
      ctx.strokeStyle="#aa744d";ctx.lineWidth=1.3;ctx.stroke();
    }
    ctx.restore();
    wholeChili(ctx,-59,4,-.21);
    wholeChili(ctx,-69,-31,.15);
    const n=Math.round(10+32*ramp(p,0,.25));
    for(let i=0;i<n;i++) pepper(ctx,34+(seed(i+31)-.5)*83,3+(seed(i+61)-.5)*41,.8+seed(i+45)*.5,i);
    const chop=Math.abs(Math.sin(ramp(p,0,.28)*Math.PI*3));
    ctx.save();ctx.translate(13,-7-chop*38);ctx.rotate(-.15+.18*chop);
    curve(ctx,"M-25 -34 L64 -34 L67 2 Q41 12 -29 7Z",palette(ctx,-35,11,["#b3c1bb","#e7e6d6","#aab7b1"]),"#66766d",2);
    curve(ctx,"M-24 4 Q21 8 65 -1",null,"#f8f9e5",2.2);
    oval(ctx,-15,-25,3.3,3.3,"#8d9c90");
    curve(ctx,"M59 -32 L127 -61 Q134 -62 136 -55 L135 -49 L67 -20Z","#976543","#6d4b35",1.5);
    oval(ctx,117,-50,1.7,1.7,"#ecce92");
    ctx.restore();ctx.restore();
  }

  function hotPeppers(ctx,p) {
    const t=ramp(p,.27,.48), flip=Math.sin(ramp(p,.37,.52)*Math.PI);
    fire(ctx,p);
    ctx.save();ctx.translate(322,192-9*flip);ctx.rotate(flip*.11);
    wok(ctx,1,menus.剁椒,p);
    for(let i=0;i<60;i++) {
      const v=ramp(t,Math.min(.56,seed(i+13)*.55),1);
      const x=(seed(i+40)-.5)*161;
      const y=(seed(i+80)-.5)*35-12;
      pepper(ctx,x+(1-v)*70,y-(1-v)*(80+seed(i+90)*60)-flip*seed(i+2)*36,.7+seed(i+17)*.68,i);
    }
    ctx.restore();
    spatula(ctx,246-12*flip,177-16*flip,-.82+.2*flip);
  }

  function coverFish(ctx,p) {
    const t=ramp(p,.47,.71);
    ctx.save();ctx.translate(327,201);bamboo(ctx);
    fish(ctx,0,-14,.86,0,"剁椒",t);
    ctx.restore();
    const x=307+92*t, y=90-12*Math.sin(t*Math.PI);
    spoon(ctx,x,y,-.57-.35*t,"#b84029");
    if (t<.98) for (let i=0;i<17;i++) {
      const drop=(t*2+seed(i+4))%1;
      pepper(ctx,x-15-20*drop+(seed(i+181)-.5)*20,
        y+11+94*drop*drop,.56+seed(i+64)*.42,i);
    }
    steam(ctx,326,167,26,p*1.8,.43);
  }

  function peppers(ctx,p) {
    if (p<=.25) {
      chopping(ctx,p);
    } else if (p<.48) {
      hotPeppers(ctx,p);
    } else {
      coverFish(ctx,p);
    }
  }

  function paintKitchen(canvas, dish, progress) {
    if (!canvas || !Object.prototype.hasOwnProperty.call(menus, dish) || !canvas.width || !canvas.height) return false;
    const ctx=canvas.getContext("2d");
    if (!ctx) return false;
    const p=Math.min(1,Math.max(0,Number(progress)||0));
    ctx.save();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=menus[dish].back;
    ctx.fillRect(0,0,canvas.width,canvas.height);
    const scale=Math.min(canvas.width/680,canvas.height/355);
    ctx.translate((canvas.width-680*scale)/2,(canvas.height-355*scale)/2);
    ctx.scale(scale,scale);
    ctx.lineCap="round";ctx.lineJoin="round";
    background(ctx,menus[dish]);
    const serve=ramp(p,.70,.86);
    if (serve<1) {
      ctx.save();
      ctx.translate(-320*serve,0);
      ctx.globalAlpha=1-serve;
      if (dish==="红烧") braise(ctx,p);
      else if (dish==="清蒸") steamed(ctx,p);
      else peppers(ctx,p);
      ctx.restore();
    }
    if (serve>0) {
      ctx.save();
      ctx.globalAlpha=serve;
      ctx.translate(333+(1-serve)*252,178+(1-serve)*25);
      const size=.86+.14*serve;
      ctx.scale(size,size);
      platter(ctx,dish);
      if (p<.96) steam(ctx,-1,-49,27,p*2,.45*(1-ramp(p,.86,.96)));
      ctx.restore();
    }
    ctx.restore();
    return true;
  }

  window.paintKitchen=paintKitchen;
})();
