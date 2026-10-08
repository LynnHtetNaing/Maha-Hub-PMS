"""Live Bagan art layer for the Maha Hub hero. Coordinates match the photo (1671 x 941)."""
import math, random

def pagoda_defs():
    return '''
<path id="pg-bell" d="M-30 0H30V-6H24V-12H18V-18H14C14-34 8-40 3-46L1.5-64L0-74L-1.5-64L-3-46C-8-40-14-34-14-18H-18V-12H-24V-6H-30Z"/>
<path id="pg-temple" d="M-34 0H34V-16H28V-22H22V-28H12C12-40 7-52 3-60L1.5-76L0-86L-1.5-76L-3-60C-7-52-12-40-12-28H-22V-22H-28V-16H-34ZM26-16l2.5-10 2.5 10ZM-31-16l2.5-10 2.5 10Z"/>
<path id="pg-small" d="M-12 0H12V-5H8C8-14 5-18 2-22L0-36L-2-22C-5-18-8-14-8-5H-12Z"/>'''

PAGODAS = [  # (x, base y, scale, type)
 (420,575,.32,"bell"),(560,577,.36,"temple"),(860,578,.34,"bell"),(1060,575,.34,"small"),(760,571,.28,"small"),
 (250,604,.55,"small"),(330,598,.72,"bell"),(400,594,.5,"small"),(470,597,.82,"temple"),(540,591,.46,"small"),
 (765,590,.58,"bell"),(815,593,.42,"small"),(1112,592,.74,"temple"),(1182,595,.52,"bell"),(1238,597,.42,"small"),
]

def pagodas():
    out=['<g class="a-pagodas">']
    lights=['<g class="a-plights">']
    for x,y,s,t in PAGODAS:
        out.append(f'<use href="#pg-{t}" transform="translate({x} {y}) scale({s})"/>')
        top = {"bell":-46,"temple":-60,"small":-22}[t]*s
        lights.append(f'<circle cx="{x}" cy="{y+top:.1f}" r="{max(1.6,4*s):.1f}"/><circle class="halo" cx="{x}" cy="{y+top:.1f}" r="{14*s+4:.1f}"/>')
    out.append('</g>'); lights.append('</g>')
    mist='<g mask="url(#mistmask)"><rect class="a-mist" x="-100" y="552" width="1900" height="70" fill="url(#mistg)"/><rect class="a-mist m2" x="-400" y="564" width="2400" height="40" fill="url(#mistg)"/></g>'
    return ''.join(out)+mist+''.join(lights)

def clouds():
    rnd=random.Random(7); g=['<g class="a-clouds">']
    specs=[(120,90,1.1,"c1"),(520,150,.8,"c2"),(900,70,1.3,"c3"),(1300,180,.9,"c1"),(300,260,.7,"c2"),(1100,300,.6,"c3"),(700,230,.75,"c1")]
    for i,(x,y,s,c) in enumerate(specs):
        blobs=''.join(f'<ellipse cx="{rnd.randint(-70,70)}" cy="{rnd.randint(-10,10)}" rx="{rnd.randint(50,110)}" ry="{rnd.randint(14,26)}"/>' for _ in range(5))
        g.append(f'<g class="cloud {c}" style="--d:{-i*17}s"><g transform="translate({x} {y}) scale({s})">{blobs}</g></g>')
    g.append('</g>'); return ''.join(g)

def balloon_defs():
    def bal(id_, a, b):
        return f'''<symbol id="{id_}" viewBox="-30 -46 60 92">
<clipPath id="{id_}-c"><path d="M0-44C22-44 30-26 28-12 26 2 12 14 6 22H-6C-12 14-26 2-28-12-30-26-22-44 0-44Z"/></clipPath>
<g clip-path="url(#{id_}-c)"><rect x="-30" y="-46" width="60" height="70" fill="{a}"/><path d="M-20-46h8v70h-8zM-2-46h8v70h-8zM16-46h8v70h-8z" fill="{b}"/><rect x="-30" y="-46" width="60" height="70" fill="url(#balshade)"/></g>
<path d="M-6 22L-4 34M6 22L4 34" stroke="#3a2a1e" stroke-width=".8"/><rect x="-5" y="34" width="10" height="8" rx="1.5" fill="#6b4a2c"/></symbol>'''
    return bal("balA","#9c2f2a","#e0a63c")+bal("balB","#e9cf9a","#b5552c")+bal("balC","#d9952f","#f3e3c3")

def balloons():
    spec=[("balA",0,330,46,"b1"),("balB",-30,250,34,"b2"),("balC",-60,380,28,"b3"),("balA",-85,210,24,"b4"),("balB",-110,300,40,"b5"),("balC",-20,170,20,"b6")]
    g=['<g class="a-balloons">']
    for sym,delay,y,w,c in spec:
        h=w*92/60
        g.append(f'<g class="bal {c}" style="--d:{delay}s"><g class="bob"><use href="#{sym}" x="0" y="{y}" width="{w}" height="{h:.0f}"/></g></g>')
    g.append('</g>'); return ''.join(g)

def lotus_defs():
    return '''<symbol id="lotus" viewBox="-30 -40 60 52" overflow="visible">
<ellipse cx="0" cy="9" rx="34" ry="8" fill="url(#cglow)"/><ellipse cx="0" cy="22" rx="5" ry="16" fill="url(#cglow)" opacity=".7"/>
<path d="M0 4C-14 4-24-2-26-10-16-10-8-6 0 4Z" fill="#f4b9c2"/><path d="M0 4C14 4 24-2 26-10 16-10 8-6 0 4Z" fill="#f4b9c2"/>
<path d="M0 4C-10-2-14-12-10-22-4-16-1-8 0 4Z" fill="#f9d3d9"/><path d="M0 4C10-2 14-12 10-22 4-16 1-8 0 4Z" fill="#f9d3d9"/>
<path d="M0 3C-5-6-5-16 0-24 5-16 5-6 0 3Z" fill="#fff0f2"/>
<rect x="-2.4" y="-16" width="4.8" height="9" rx="1" fill="#f5ead2"/>
<circle class="cglow" cx="0" cy="-22" r="22" fill="url(#cglow)"/>
<path class="flame" d="M0-34C5-27 5-21 0-16-5-21-5-27 0-34Z" fill="#ffcf6e"/><path d="M0-27C2-24 2-21 0-19-2-21-2-24 0-27Z" fill="#fff6d8"/></symbol>'''

def lotuses():
    spec=[(0,760,1.0),(-9,820,1.3),(-18,700,.8),(-27,880,1.5),(-36,740,.9),(-45,850,1.2),(-54,720,.85),(-63,900,1.4)]
    g=['<g class="a-lotus">']
    for i,(d,y,s) in enumerate(spec):
        g.append(f'<g class="lt" style="--d:{d}s;--dur:{70+i*6}s"><g class="bob"><use href="#lotus" x="{-30*s:.0f}" y="{y-40*s:.0f}" width="{60*s:.0f}" height="{52*s:.0f}"/></g></g>')
    g.append('</g>'); return ''.join(g)

def palace():
    """Golden royal pyatthat (tiered Burmese palace roof) crowning the pavilion on the right."""
    cx, base = 1563, 472
    tiers = [(214,40),(172,36),(134,33),(100,30),(70,28)]
    parts=[]; y=base
    for i,(w,h) in enumerate(tiers):
        hw=w/2; top=y-h; tw=hw*0.62
        # body wall between tiers
        if i>0:
            parts.append(f'<rect x="{cx-hw*0.5:.1f}" y="{y-2:.1f}" width="{hw:.1f}" height="8" fill="#3b2414"/><rect x="{cx-hw*0.5:.1f}" y="{y-2:.1f}" width="{hw:.1f}" height="1.6" fill="#f2c56b"/><rect x="{cx-hw*0.5:.1f}" y="{y+4.4:.1f}" width="{hw:.1f}" height="1.2" fill="#f2c56b" opacity=".7"/>')
            y-=7; top=y-h
        # roof tier with upturned, flame-like eaves
        parts.append(f'<path class="tier" d="M{cx-hw-12:.1f} {y-14:.1f}C{cx-hw-6:.1f} {y-4:.1f} {cx-hw+2:.1f} {y:.1f} {cx-hw+10:.1f} {y:.1f}H{cx+hw-10:.1f}C{cx+hw-2:.1f} {y:.1f} {cx+hw+6:.1f} {y-4:.1f} {cx+hw+12:.1f} {y-14:.1f}L{cx+tw:.1f} {top:.1f}H{cx-tw:.1f}Z" fill="url(#goldv)"/>')
        parts.append(f'<path d="M{cx-hw+10:.1f} {y:.1f}H{cx+hw-10:.1f}" stroke="#7a4a14" stroke-width="2.4"/>')
        # small gable finials on the eave tips
        for sx in (-1,1):
            ex=cx+sx*(hw+12); parts.append(f'<path d="M{ex:.1f} {y-14:.1f}q{sx*4:.1f} -10 {sx*-2:.1f} -18" stroke="#f2c56b" stroke-width="2" fill="none" stroke-linecap="round"/>')
        y=top
    # bell, rings and hti umbrella finial
    parts.append(f'<path d="M{cx-22} {y}C{cx-20} {y-18} {cx-10} {y-30} {cx} {y-38}C{cx+10} {y-30} {cx+20} {y-18} {cx+22} {y}Z" fill="url(#goldv)"/>')
    ry=y-38
    for k in range(4):
        parts.append(f'<ellipse cx="{cx}" cy="{ry-k*7}" rx="{8-k*1.4:.1f}" ry="2.6" fill="#f2c56b"/>')
    ry-=30
    parts.append(f'<path d="M{cx-11} {ry+6}L{cx} {ry-6}L{cx+11} {ry+6}Z" fill="#f6d27e"/><path d="M{cx} {ry-6}V{ry-34}" stroke="#f6d27e" stroke-width="2"/><path d="M{cx} {ry-34}l9 4-9 4Z" fill="#f6d27e"/><circle class="hti" cx="{cx}" cy="{ry-36}" r="3" fill="#fff3c4"/>')
    # gold trim on the existing roof edge

    return f'<g class="a-palace" transform="translate({cx} {base}) scale(.6) translate({-cx} {-base})"><g class="pglow"><ellipse cx="1563" cy="380" rx="150" ry="170" fill="url(#cglow)"/></g>'+''.join(parts)+'</g>'

def defs():
    return f'''<defs>
<linearGradient id="mistg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--mist,#fff1d6)" stop-opacity="0"/><stop offset=".55" stop-color="var(--mist,#fff1d6)" stop-opacity=".32"/><stop offset="1" stop-color="var(--mist,#fff1d6)" stop-opacity="0"/></linearGradient>
<linearGradient id="goldv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7d68a"/><stop offset=".45" stop-color="#d9a441"/><stop offset="1" stop-color="#8a5a1c"/></linearGradient>
<linearGradient id="balshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".4"/></linearGradient>
<radialGradient id="cglow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".85"/><stop offset=".4" stop-color="#ffb24a" stop-opacity=".25"/><stop offset="1" stop-color="#ffb24a" stop-opacity="0"/></radialGradient>
<radialGradient id="sung"><stop offset="0" stop-color="#fffbe8"/><stop offset=".25" stop-color="#ffe7a8"/><stop offset=".55" stop-color="#ffc66a" stop-opacity=".45"/><stop offset="1" stop-color="#ffb24a" stop-opacity="0"/></radialGradient>
<radialGradient id="suncov"><stop offset="0" stop-color="#f5c46a"/><stop offset=".45" stop-color="#f3bd63" stop-opacity=".9"/><stop offset="1" stop-color="#f3bd63" stop-opacity="0"/></radialGradient>
<filter id="softc" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="mistx" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="#fff"/><stop offset=".82" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="mistmask"><rect x="0" y="0" width="1671" height="941" fill="url(#mistx)"/></mask>
{pagoda_defs()}{balloon_defs()}{lotus_defs()}
</defs>'''

def hero_water():
    return '''<svg class="hl-art hl-water" viewBox="0 0 1671 941" preserveAspectRatio="none" aria-hidden="true"><defs>
<filter id="wflow" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0035 0.05" numOctaves="2" seed="4"><animate attributeName="baseFrequency" dur="22s" values="0.0035 0.05;0.005 0.065;0.0035 0.05" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="9" xChannelSelector="R" yChannelSelector="G"/></filter>
<clipPath id="waterclip"><path d="M150 672H1060L1010 941H150Z"/><path d="M1000 742H1671V941H950Z"/></clipPath>
<filter id="skyflow" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0018 0.0045" numOctaves="2" seed="11"><animate attributeName="baseFrequency" dur="70s" values="0.0018 0.0045;0.0025 0.0062;0.0018 0.0045" repeatCount="indefinite"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="26" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" dur="45s" values="18;32;18" repeatCount="indefinite"/></feDisplacementMap></filter>
<filter id="feather" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="24"/></filter>
<mask id="skymask"><path d="M200 -40H1470V350L1320 412L1255 452H170V230Z" fill="#fff" filter="url(#feather)"/></mask></defs>
<g mask="url(#skymask)"><g class="a-skydrift"><g filter="url(#skyflow)"><image class="a-skyimg" x="0" y="0" width="1671" height="941" preserveAspectRatio="none"/></g></g></g>
<g class="a-water" filter="url(#wflow)" clip-path="url(#waterclip)"><image class="a-waterimg" x="0" y="0" width="1671" height="941" preserveAspectRatio="none"/></g></svg>'''

def hero_art():
    return f'''<svg class="hl-art" viewBox="0 0 1671 941" preserveAspectRatio="none" aria-hidden="true">{defs()}
<circle class="a-suncover" cx="1285" cy="493" r="62" fill="url(#suncov)"/>
<g class="a-sun"><circle r="120" fill="url(#sung)" class="sunhalo"/><circle r="17" fill="#fffaf0"/></g>
{clouds()}
{pagodas()}
{balloons()}
<g class="a-starref"></g>
{lotuses()}
</svg>'''
