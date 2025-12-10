# variables conseillées
export SOURCE_ICS_URL="https://outlook.office365.com/owa/calendar/2daf83a02c4c4f7ca8000d7d213f1ab2@hesge.ch/1793e647678d4b49a1ff87971d4d56654710512652072737128/calendar.ics"
export TARGET_TZ="Europe/Zurich"   # par défaut déjà Europe/Zurich
# optionnel: export ADD_VTIMEZONE=1  # injecte un bloc VTIMEZONE minimal CET/CEST
export PORT=3003

node server.ts
