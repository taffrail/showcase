
import Showcase from "./showcase";
import ShowcaseMobile from "./showcaseMobile";

if (window.jga._isMobile) {
  new ShowcaseMobile().init();
} else {
  new Showcase().init();
}