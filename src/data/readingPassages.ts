import { ReadingPassage } from '../types/voice';

export const BUILTIN_READING_PASSAGES: ReadingPassage[] = [
  {
    id: 'nordwind-und-sonne',
    title: 'Der Nordwind und die Sonne (Logopädie-Klassiker)',
    category: 'standard',
    difficulty: 'mittel',
    focusTip:
      'Achte auf weiche Stimmeinsätze bei Vokalen und halte die Satzenden leicht schwebend, statt am Ende des Satzes stark in den maskulinen Bereich abzusinken.',
    content:
      'Einst stritten sich Nordwind und Sonne, wer von ihnen beiden wohl der Stärkere wäre, als ein Wanderer, der in einen warmen Mantel gehüllt war, des Weges daherkam. Sie wurden einig, dass derjenige für den Stärkeren gelten sollte, der den Wanderer zwingen würde, seinen Mantel abzunehmen. Der Nordwind blies mit aller Macht, aber je mehr er blies, desto fester hüllte sich der Wanderer in seinen Mantel ein. Endlich gab der Nordwind den Kampf auf. Nun erwärmte die Sonne die Luft mit ihren freundlichen Strahlen, und schon nach wenigen Augenblicken zog der Wanderer seinen Mantel aus. Da musste der Nordwind zugeben, dass die Sonne von ihnen beiden der Stärkere war.',
  },
  {
    id: 'regenbogen-passage',
    title: 'Die Regenbogen-Passage (Phonetisch ausgewogen)',
    category: 'standard',
    difficulty: 'mittel',
    focusTip:
      'Dieser Text deckt alle deutschen Lautkombinationen ab. Versuche eine entspannte, helle Mundraum-Resonanz über den gesamten Absatz beizubehalten.',
    content:
      'Wenn das Sonnenlicht auf Regentropfen in der Luft trifft, wirken diese wie kleine Prismen und formen einen Regenbogen. Der Regenbogen ist ein Bogen aus sieben leuchtenden Farben: Rot, Orange, Gelb, Grün, Blau, Indigo und Violett. Seit Jahrhunderten betrachten Menschen dieses wunderbare Schauspiel am Himmel mit Freude und Staunen. Viele alte Geschichten erzählen von einem Topf voll Gold am Ende des Regenbogens, doch niemand hat diesen Ort jemals erreicht.',
  },
  {
    id: 'discord-alltag-gaming',
    title: 'Discord & Gaming: Spontane Reaktionen im Voice-Chat',
    category: 'discord',
    difficulty: 'leicht',
    focusTip:
      'Im Discord rutscht die Stimme oft bei kurzen Füllwörtern („ähm“, „okay“, „warte“) nach unten. Sprich diese Sätze locker und mit einem leichten inneren Lächeln für hohe F2-Resonanz.',
    content:
      'Hey ihr Lieben, hört ihr mich gut oder bin ich im Discord zu leise? Warte mal kurz, ich komme sofort in euren Channel! Oh, hinter dir, pass auf auf der linken Seite! Super gespielt, das war richtig knapp gerade. Wollen wir danach noch eine gemütliche Runde zusammen starten oder erst mal kurz Pause machen? Ich hole mir eben ein Glas Wasser und bin in zwei Minuten wieder da!',
  },
  {
    id: 'discord-deep-talk',
    title: 'Discord Abendrunde: Längeres Erzählen mit Freunden',
    category: 'discord',
    difficulty: 'fortgeschritten',
    focusTip:
      'Beim entspannten Erzählen am Abend wird die Stimme schnell müde oder monoton. Nutze lieber Melodiebögen (Intonation) statt reiner Kraft, um feminin zu klingen.',
    content:
      'Ach, mein Tag heute war eigentlich ganz entspannt, auch wenn es am Nachmittag ziemlich viel zu tun gab. Ich habe vorhin noch eine neue Einstellung ausprobiert und finde, das klingt jetzt schon viel angenehmer als letzte Woche. Wie lief es denn bei euch heute so? Erzählt mal, was ihr am Wochenende geplant habt!',
  },
  {
    id: 'resonanz-vorderzunge',
    title: 'Helle Klangfarbe: Vorderzungenvokale (/i/, /e/, /ä/)',
    category: 'resonanz',
    difficulty: 'leicht',
    focusTip:
      'Laute wie „i“ und „e“ verengen den vorderen Mundraum und heben den zweiten Formanten (F2) automatisch an. Nimm diese Helligkeit mit in die darauffolgenden Wörter.',
    content:
      'Viele kleine Lichter glitzern im stillen See. Sieben flinke Bienen fliegen über grüne Wiesen im milden Frühlingswind. Wenn wir mit einem leichten Lächeln sprechen, klingt die Stimme direkt viel heller, weicher und klarer. Bitte gib mir Bescheid, wie dir diese helle Melodie gefällt.',
  },
  {
    id: 'intonation-melodie',
    title: 'Lebendige Sprachmelodie & Fragesätze',
    category: 'resonanz',
    difficulty: 'mittel',
    focusTip:
      'Weiblich wahrgenommene Sprachmelodie lebt von sanften Tonhöhen-Aufstiegen auf betonten Silben, anstatt Wörter nur durch Lautstärke-Druck zu betonen.',
    content:
      'Meinst du wirklich, dass wir das heute noch schaffen? Wie wunderschön das hier aussieht! Hast du schon gesehen, wie hell der Himmel heute Abend leuchtet? Ich freue mich total, dass wir uns endlich wieder hören! Was hältst du davon, wenn wir morgen einfach gemeinsam weitermachen?',
  },
];
