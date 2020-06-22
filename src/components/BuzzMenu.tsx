// Contextual Menu with this state
// Always show menu with Team Names as section headers, and players underneath
// When we have more information in the cycles and the starting lineup, we can filter the menu to whoever is current
// -If there are no wrong buzzes on this word:
// ---> always show Correct | Wrong for the menu items
// - If there is one wrong buzz on this word:
// ---> show Correct | Wrong on that buzzer, and Correct | Wrong (first buzz) | Wrong (second buzz) for others
// https://developer.microsoft.com/en-us/fluentui#/controls/web/contextualmenu

import * as React from "react";
import { observer } from "mobx-react";
import { ContextualMenu, ContextualMenuItemType, IContextualMenuItem } from "office-ui-fabric-react/lib/ContextualMenu";

import { GameState } from "src/state/GameState";
import { UIState } from "src/state/UIState";
import { Player, Team } from "src/state/TeamState";
import { Cycle } from "src/state/Cycle";
import { Tossup } from "src/state/PacketState";
import { IBuzzMarker } from "src/state/IBuzzMarker";

export const BuzzMenu = observer((props: IBuzzMenuProps) => {
    const onHideBuzzMenu: () => void = React.useCallback(() => onBuzzMenuDismissed(props), [props.uiState]);

    const firstTeamMenuItems: IContextualMenuItem[] = getPlayerMenuItems(props, props.game.firstTeam);
    const secondTeamMenuItems: IContextualMenuItem[] = getPlayerMenuItems(props, props.game.secondTeam);

    const menuItems: IContextualMenuItem[] = [
        {
            key: "firstTeamSection",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                bottomDivider: true,
                title: props.game.firstTeam.name,
                items: firstTeamMenuItems,
            },
        },
        {
            key: "secondTeamSection",
            itemType: ContextualMenuItemType.Section,
            sectionProps: {
                bottomDivider: true,
                title: props.game.secondTeam.name,
                items: secondTeamMenuItems,
            },
        },
    ];
    return (
        <ContextualMenu
            hidden={!props.uiState.buzzMenuVisible}
            target={props.target}
            items={menuItems}
            onDismiss={onHideBuzzMenu}
            shouldFocusOnMount={true}
            shouldFocusOnContainer={true}
            shouldUpdateWhenHidden={true}
        />
    );
});

function getPlayerMenuItems(props: IBuzzMenuProps, team: Team): IContextualMenuItem[] {
    // TODO: Need to support Wrong (1st buzz) and Wrong (2nd buzz)
    // TODO: Add some highlighting/indicator on the player to show that they have a buzz

    const players: Player[] = props.game.getPlayers(team);
    return players.map((player, index) => {
        const topLevelKey = `Team_${team.name}_Player_${index}`;
        const isCorrectChecked: boolean =
            props.cycle.correctBuzz?.marker.player === player &&
            props.cycle.correctBuzz.marker.position === props.position;
        const isWrongChecked: boolean =
            props.cycle.incorrectBuzzes.findIndex(
                (buzz) => buzz.marker.player === player && buzz.marker.position === props.position
            ) >= 0;
        const isProtestChecked: boolean =
            isWrongChecked &&
            props.cycle.tosuspProtests?.findIndex((protest) => protest.position === props.position) != undefined;

        const subMenuItems: IContextualMenuItem[] = [
            {
                key: `${topLevelKey}_correct`,
                text: "Correct",
                canCheck: true,
                checked: isCorrectChecked,
                onClick: React.useCallback(
                    (
                        ev?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
                        item?: IContextualMenuItem
                    ) => onCorrectClicked(item, props, player),
                    [props, player]
                ),
            },
            {
                key: `${topLevelKey}_wrong`,
                text: "Wrong",
                canCheck: true,
                checked: isWrongChecked,
                onClick: React.useCallback(
                    (
                        ev?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
                        item?: IContextualMenuItem
                    ) => onWrongClicked(item, props, player),
                    [props, player]
                ),
            },
        ];

        if (isWrongChecked) {
            subMenuItems.push({
                key: `${topLevelKey}_protest`,
                text: "Protest",
                canCheck: true,
                checked: isProtestChecked,
                onClick: React.useCallback(
                    (
                        ev?: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>,
                        item?: IContextualMenuItem
                    ) => onProtestClicked(item, props, player),
                    [props, player]
                ),
            });
        }

        // TODO: See if we can improve the style, since the background doesn't change on hover. We can look into
        // tagging this with a class name and using react-jss, or using a style on the parent component (much harder to
        // do without folding this back into the render method)
        return {
            key: `Team_${team.name}_Player_${index}`,
            text: player.name,
            style: {
                background: isCorrectChecked ? "rgba(0,128,128,0.1)" : isWrongChecked ? "rgba(128,0,0,0.1)" : undefined,
            },
            subMenuProps: {
                key: `${topLevelKey}_correctness`,
                items: subMenuItems,
            },
        };
    });
}

function onBuzzMenuDismissed(props: IBuzzMenuProps): void {
    props.uiState.hideBuzzMenu();
    props.uiState.setSelectedWordIndex(-1);
}

function onCorrectClicked(item: IContextualMenuItem | undefined, props: IBuzzMenuProps, player: Player): void {
    if (item?.checked) {
        props.cycle.removeCorrectBuzz();
    } else if (item?.checked === false) {
        props.cycle.addCorrectBuzz(
            {
                player,
                position: props.position,
                correct: true,
            },
            props.tossupNumber - 1
        );
    }
}

function onWrongClicked(item: IContextualMenuItem | undefined, props: IBuzzMenuProps, player: Player): void {
    if (item?.checked) {
        props.cycle.removeWrongBuzz(player);
    } else if (item?.checked === false) {
        const marker: IBuzzMarker = {
            player,
            position: props.position,
            correct: false,
        };

        // If we're at the end of the question, or if there's already been a neg, then make it a no penalty buzz
        if (props.position >= props.tossup.question.length || props.cycle.negBuzz != undefined) {
            props.cycle.addNoPenaltyBuzz(marker, props.tossupNumber - 1);
        } else {
            props.cycle.addNeg(marker, props.tossupNumber - 1);
        }
    }
}

function onProtestClicked(item: IContextualMenuItem | undefined, props: IBuzzMenuProps, player: Player): void {
    if (item?.checked) {
        props.cycle.removeTossupProtest(player.team);
    } else if (item?.checked === false) {
        props.uiState.setPendingTossupProtest(player.team, props.tossupNumber - 1, props.position);
    }
}

export interface IBuzzMenuProps {
    cycle: Cycle;
    game: GameState;
    position: number;
    target: React.MutableRefObject<null>;
    tossup: Tossup;
    tossupNumber: number;
    uiState: UIState;
}