import * as React from "react";
import { observer } from "mobx-react";
import { Cycle } from "src/state/Cycle";
import {
    IThrowOutQuestionEvent,
    ITossupAnswerEvent,
    ISubstitutionEvent,
    IBonusProtestEvent,
    ITossupProtestEvent,
    IBonusAnswerEvent,
} from "src/state/Events";
import { CycleItem } from "./CycleItem";

export const CycleItemList = observer(
    (props: ICycleItemListProps): JSX.Element => {
        return <div>{createCycleList(props.cycle)}</div>;
    }
);

// TODO: Consider moving some of this logic to a separate class for testing; specifically ordering ones
// TODO: Investigate using List/DetailedList for this, instead of returning a bunch of individual elements
function createCycleList(cycle: Cycle): JSX.Element[] {
    // Ordering should be
    // Substitutions
    // Buzzes and thrown out tossups, based on the tossup index. If a thrown out tossup and buzz have the same index,
    // prefer the buzz.
    // Thrown out bonuses
    // Bonus Answer
    // TU protests
    // Bonus protests
    const elements: JSX.Element[] = [];

    if (cycle.subs) {
        elements.concat(createSubstitutionDetails(cycle.subs));
    }

    const thrownOutTossups: IThrowOutQuestionEvent[] = cycle.thrownOutTossups ?? [];
    thrownOutTossups.sort((event, otherEvent) => event.questionIndex - otherEvent.questionIndex);
    const orderedBuzzes: ITossupAnswerEvent[] = cycle.orderedBuzzes;

    if (orderedBuzzes.length === 0) {
        for (let i = 0; i < thrownOutTossups.length; i++) {
            elements.push(createThrowOutQuestionDetails(cycle, thrownOutTossups[i], i, /* isTossup */ true));
        }
    } else {
        // We want buzzes on a specific question to appear before the event throwing out that question appears.
        // Because tossups can be thrown out before any buzzes or between an incorrect buzz and a correct buzz, we have
        // to loop through both buzzes and thrown out questions to display the events in order
        let currentTossupIndex: number = orderedBuzzes[0].tossupIndex;
        let thrownOutTossupsIndex = 0;
        for (let i = 0; i < orderedBuzzes.length; i++) {
            const buzz = orderedBuzzes[i];
            if (buzz.tossupIndex >= currentTossupIndex) {
                currentTossupIndex = buzz.tossupIndex;

                while (
                    thrownOutTossupsIndex < thrownOutTossups.length &&
                    thrownOutTossups[thrownOutTossupsIndex].questionIndex < currentTossupIndex
                ) {
                    elements.push(
                        createThrowOutQuestionDetails(
                            cycle,
                            thrownOutTossups[thrownOutTossupsIndex],
                            thrownOutTossupsIndex,
                            /* isTossup */ true
                        )
                    );
                    thrownOutTossupsIndex++;
                }
            }

            elements.push(createTossupAnswerDetails(cycle, buzz, i));
        }

        // Ordering is still a little off, and the buzzes remain in view. Tweak this.
        for (; thrownOutTossupsIndex < thrownOutTossups.length; thrownOutTossupsIndex++) {
            elements.push(
                createThrowOutQuestionDetails(
                    cycle,
                    thrownOutTossups[thrownOutTossupsIndex],
                    thrownOutTossupsIndex,
                    /* isTossup */ true
                )
            );
        }
    }

    if (cycle.thrownOutBonuses) {
        for (let i = 0; i < cycle.thrownOutBonuses.length; i++) {
            elements.push(createThrowOutQuestionDetails(cycle, cycle.thrownOutBonuses[i], i, /* isTossup */ false));
        }
    }

    if (cycle.bonusAnswer) {
        elements.push(createBonusAnswerDetails(cycle.bonusAnswer));
    }

    if (cycle.tossupProtests) {
        for (let i = 0; i < cycle.tossupProtests.length; i++) {
            elements.push(createTossupProtestDetails(cycle, cycle.tossupProtests[i], i));
        }
    }

    if (cycle.bonusProtests) {
        for (let i = 0; i < cycle.bonusProtests.length; i++) {
            elements.push(createBonusProtestDetails(cycle, cycle.bonusProtests[i], i));
        }
    }

    return elements;
}

function createSubstitutionDetails(subs: ISubstitutionEvent[]): JSX.Element[] {
    return subs.map((sub, index) => {
        const text = `Substitution (${sub.inPlayer.team.name}): ${sub.inPlayer.name} in for ${sub.outPlayer.name}`;
        return <CycleItem key={`sub_${index}_${sub.inPlayer.name}_${sub.outPlayer.name}`} text={text} />;
    });
}

function createTossupAnswerDetails(cycle: Cycle, buzz: ITossupAnswerEvent, buzzIndex: number): JSX.Element {
    // TODO: Look into using something like shortid for the key
    // TODO: Find out how to prevent us from creating this each time. React will throw if we use useCallback:
    // https://reactjs.org/docs/hooks-rules.html#only-call-hooks-at-the-top-level
    const deleteHandler = () => {
        if (buzz.marker.correct) {
            cycle.removeCorrectBuzz();
        } else {
            cycle.removeWrongBuzz(buzz.marker.player);
        }
    };

    const text = `${buzz.marker.player.name} (${buzz.marker.player.team.name}) answered ${
        buzz.marker.correct ? "CORRECTLY" : "WRONGLY"
    } on tossup #${buzz.tossupIndex + 1} at word ${buzz.marker.position + 1}`;
    return (
        <CycleItem
            key={`buzz_${buzzIndex}_tu_${buzz.tossupIndex}_${buzz.marker.player.name}_${buzz.marker.player.team.name}`}
            text={text}
            onDelete={deleteHandler}
        />
    );
}

function createThrowOutQuestionDetails(
    cycle: Cycle,
    thrownOutEvent: IThrowOutQuestionEvent,
    thrownOutIndex: number,
    isTossup: boolean
): JSX.Element {
    const questionType: string = isTossup ? "tossup" : "bonus";
    const text = `Threw out ${questionType} #${thrownOutEvent.questionIndex + 1}`;
    const deleteHandler = () => {
        if (isTossup) {
            cycle.removeThrownOutTossup(thrownOutEvent.questionIndex);
        } else {
            cycle.removeThrownOutBonus(thrownOutEvent.questionIndex);
        }
    };

    return <CycleItem key={`throw_out_${questionType}_${thrownOutIndex}`} text={text} onDelete={deleteHandler} />;
}

function createBonusAnswerDetails(bonusAnswer: IBonusAnswerEvent): JSX.Element {
    const parts: string = bonusAnswer.correctParts
        .map((part) => part.index + 1)
        .sort()
        .join(", ");
    const partsText: string = parts.length === 0 ? "no parts" : `part${parts.length > 1 ? "s" : ""} ${parts}`;
    const total: number = bonusAnswer.correctParts.reduce((previous, current) => previous + current.points, 0);
    const text = `${bonusAnswer.receivingTeam.name} answered ${partsText} correctly for ${total} points`;

    return <CycleItem key="bonus_answer" text={text} />;
}

function createTossupProtestDetails(cycle: Cycle, protest: ITossupProtestEvent, protestIndex: number): JSX.Element {
    const deleteHandler = () => {
        cycle.removeTossupProtest(protest.team);
    };

    const text = `${protest.team.name} protests tossup #${protest.questionIndex + 1} at word ${protest.position + 1}`;
    return (
        <CycleItem key={`tu_protest_${protestIndex}_${protest.questionIndex}`} text={text} onDelete={deleteHandler} />
    );
}

function createBonusProtestDetails(cycle: Cycle, protest: IBonusProtestEvent, protestIndex: number): JSX.Element {
    const deleteHandler = () => {
        cycle.removeBonusProtest(protest.part);
    };
    const text = `${protest.team.name} protests bonus #${protest.questionIndex + 1}, part ${protest.part + 1}`;

    return (
        <CycleItem
            key={`bonus_protest_${protestIndex}_${protest.questionIndex}`}
            text={text}
            onDelete={deleteHandler}
        />
    );
}

interface ICycleItemListProps {
    cycle: Cycle;
}