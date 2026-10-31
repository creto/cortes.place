"use client";
import { motion } from "motion/react";
import Container from "./container";
import type { GroveStats } from "./panda-grove/panda-grove";

const QuoteLines = () => (
    <>
        el bambú que se dobla
        <br />
        es más fuerte que el roble que resiste
        <span
            aria-hidden="true"
            className="ml-1 inline-block h-[1em] w-[0.55em] translate-y-[0.15em] animate-blink bg-foreground motion-reduce:animate-none"
        />
    </>
);

const Bio = () => (
    <>
        <h1>Hola, soy Gabriel Cortés.</h1>
        <p>Diseño y construyo sitios web y productos digitales.</p>
        <p>Del primer boceto a la página publicada: interfaces claras, animación con propósito y código cuidado.</p>
        <p>Aquí reúno algunos de los sitios que he hecho.</p>
    </>
);

const FrontPage = ({ stats }: { stats: GroveStats }) => (
    <>
        {mobilePage()}
        {desktopPage({ stats })}
    </>
);

const desktopPage = ({ stats }: { stats: GroveStats }) => {
    return (
        <Container
            as="header"
            className="relative flex h-full flex-col justify-start gap-8 max-lg:hidden bg-transparent pt-[clamp(6rem,14vh,9rem)] text-foreground [@media(max-height:720px)]:gap-5 [@media(max-height:720px)]:pt-20"
        >
            {stats.pandas > 0 && (
                <div
                    data-koi-avoid
                    aria-hidden="true"
                    className="absolute right-6 top-8 font-geistMono text-[11px] leading-relaxed tabular-nums lg:right-[20vw]"
                >
                    <div className="opacity-[0.32]">{stats.pandas}</div>
                    {/* The shoot count flashes each time it changes, tying a click or a last bite to the number. */}
                    <motion.div
                        key={stats.shoots}
                        initial={{ opacity: 1 }}
                        animate={{ opacity: 0.32 }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                    >
                        {stats.shoots}
                    </motion.div>
                </div>
            )}
            <motion.blockquote
                data-koi-avoid
                className="font-geistMono text-[14px] lowercase leading-relaxed tracking-[0.02em]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 0.4 }}
            >
                <QuoteLines />
            </motion.blockquote>
            <motion.div
                data-koi-avoid
                className="max-w-[34rem] font-geistMono text-[15px] leading-[max(22px,3vh)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
            >
                <Bio />
            </motion.div>
        </Container>
    );
};

const mobilePage = () => {
    return (
        // Up top, under the floating nav pill, so the grove has the bottom of the screen to itself.
        <Container
            as="header"
            className="flex h-full flex-col justify-start gap-6 lg:hidden bg-transparent pt-24 font-geistMono text-foreground [@media(max-height:640px)]:gap-4"
        >
            <motion.blockquote
                data-koi-avoid
                className="text-[13px] lowercase leading-relaxed tracking-[0.02em]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                transition={{ duration: 0.4 }}
            >
                <QuoteLines />
            </motion.blockquote>
            <motion.div
                data-koi-avoid
                className="flex flex-col gap-3 text-[14px] leading-[1.6]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
            >
                <Bio />
            </motion.div>
        </Container>
    );
};

export default FrontPage;
