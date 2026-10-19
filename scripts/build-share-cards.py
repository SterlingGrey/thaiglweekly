#!/usr/bin/env python3
"""Regenerate committed 1200x630 cards with Pillow; not required by the site build."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parent.parent
out=root/'assets/social';out.mkdir(exist_ok=True)
font='/System/Library/Fonts/Supplemental/Arial.ttf';bold='/System/Library/Fonts/Supplemental/Arial Bold.ttf'
cards={
'home':('YOUR THAI GL WEEK',['The shows. The stories.','Your Monday sorted.'],'FREE NEWSLETTER + FREE TRACKER'),
'subscribe':('THE FREE MONDAY EMAIL',['Less searching.','More watching.'],'Sterling’s Top Six • Essays • Dao’s films'),
 'tracker':('THE FREE SERIES TRACKER',['What’s next?','Where can I watch?'],'Episode dates • Official links • Country notes'),
 'newsletter':('READ THE MONDAY EMAIL',['A whole issue.','Before you join.'],'Sterling’s perspective. The week brought together.'),
 'essays':('ESSAYS BY STERLING GREY',['Stay for','the story.'],'Thai GL, the performances, and what stays with us.')}
cards.update({'pls-love':('THE FREE VIEWING GUIDE',['PLS Love','Where to watch'],'Official links • Episode dates • Country notes'),'juliet-and-juliet':('THE FREE VIEWING GUIDE',['Juliet & Juliet','Where to watch'],'Official links • Episode dates • Country notes')})
cards.update({'third-person':('THE FREE VIEWING GUIDE',['Third Person','Where to watch'],'Official links • Episode dates • Country notes'),'fairway-of-love':('THE FREE VIEWING GUIDE',['Fairway of Love','Where to watch'],'Official links • Episode dates • Country notes'),'khom-khlang':('THE FREE VIEWING GUIDE',['Khom Khlang','Where to watch'],'Official links • Episode dates • Country notes')})
logo=Image.open(root/'essays/logo-tgw.png').convert('RGB');logo.thumbnail((360,360),Image.Resampling.LANCZOS)
for name,(eyebrow,lines,sub) in cards.items():
 im=Image.new('RGB',(1200,630),'#11152d');d=ImageDraw.Draw(im)
 d.rectangle((24,24,1175,605),outline='#ba9854',width=2)
 d.text((65,61),'THAI GL WEEKLY',font=ImageFont.truetype(bold,29),fill='#edca73')
 d.line((65,117,1135,117),fill='#ba9854',width=2)
 d.text((65,153),eyebrow,font=ImageFont.truetype(bold,21),fill='#edca73')
 for i,line in enumerate(lines):d.text((65,215+i*83),line,font=ImageFont.truetype(bold,62),fill='#fffaf0')
 d.text((65,425),sub,font=ImageFont.truetype(font,23),fill='#d9d9e3')
 im.paste(logo,(800,145))
 d.line((65,510,1135,510),fill='#ba9854',width=1)
 d.text((65,548),'thaiglweekly.com',font=ImageFont.truetype(bold,27),fill='#edca73')
 d.text((880,551),'ALWAYS FREE',font=ImageFont.truetype(bold,20),fill='#fffaf0')
 im.save(out/f'{name}-v1.png',optimize=True)
