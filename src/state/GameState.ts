import { computed, observable, action } from "mobx";
import { format } from "mobx-sync";

import { PacketState, Bonus, Tossup } from "./PacketState";
import { Player } from "./TeamState";
import { Cycle, ICycle } from "./Cycle";
import { ISubstitutionEvent, IPlayerJoinsEvent, IPlayerLeavesEvent } from "./Events";

export class GameState {
    @observable
    public packet: PacketState;

    @observable
    public players: Player[];

    // Anything with methods/computeds not at the top level needs to use @format to deserialize correctly
    @observable
    @format((deserializedArray: ICycle[]) => {
        return deserializedArray.map((deserializedCycle) => {
            return new Cycle(deserializedCycle);
        });
    })
    public cycles: Cycle[];

    constructor() {
        this.packet = new PacketState();
        this.players = [];
        this.cycles = [];
    }

    @computed
    public get isLoaded(): boolean {
        return this.packet.tossups.length > 0;
    }

    public get teamNames(): string[] {
        const teamSet: Set<string> = new Set<string>(this.players.map((player) => player.teamName));

        const teamNames: string[] = [];
        for (const teamName of teamSet.values()) {
            teamNames.push(teamName);
        }

        teamNames.sort();
        return teamNames;
    }

    @computed({ requiresReaction: true })
    public get finalScore(): [number, number] {
        return this.scores[this.cycles.length - 1];
    }

    @computed({ requiresReaction: true })
    public get scores(): [number, number][] {
        const score: [number, number][] = [];
        let firstTeamPreviousScore = 0;
        let secondTeamPreviousScore = 0;

        for (const cycle of this.cycles) {
            const scoreChange: [number, number] = this.getScoreChangeFromCycle(cycle);
            firstTeamPreviousScore += scoreChange[0];
            secondTeamPreviousScore += scoreChange[1];
            score.push([firstTeamPreviousScore, secondTeamPreviousScore]);
        }

        return score;
    }

    // TODO: Update this to support powers, and take into account format rules (powers/super-powers, etc.)
    public getScoreChangeFromCycle(cycle: Cycle): [number, number] {
        const change: [number, number] = [0, 0];
        if (cycle.correctBuzz) {
            const indexToUpdate: number = this.teamNames.indexOf(cycle.correctBuzz.marker.player.teamName);
            if (indexToUpdate < 0) {
                throw new Error(
                    `Correct buzz belongs to a non-existent team ${cycle.correctBuzz.marker.player.teamName}`
                );
            }

            // More complex with powers. Need to convert buzzes to points, then add bonuses.
            // Would want getScore(team) method to simplify it
            change[indexToUpdate] += 10;
            if (cycle.bonusAnswer) {
                change[indexToUpdate] += cycle.bonusAnswer.correctParts.reduce(
                    (previous, current) => previous + current.points,
                    0
                );
            }
        }

        if (cycle.negBuzz) {
            const indexToUpdate: number = this.teamNames.indexOf(cycle.negBuzz.marker.player.teamName);
            if (indexToUpdate < 0) {
                throw new Error(`Correct buzz belongs to a non-existent team ${cycle.negBuzz.marker.player.teamName}`);
            }

            change[indexToUpdate] -= 5;
        }

        return change;
    }

    @action
    public addPlayer(player: Player): void {
        this.players.push(player);
    }

    @action
    public addPlayers(players: Player[]): void {
        this.players.push(...players);
    }

    @action
    public addPlayersForDemo(teamName: string, ...names: string[]): void {
        this.players.push(...names.map((name) => new Player(name, teamName, /* isStarter */ true)));
    }

    @action
    public clear(): void {
        this.packet = new PacketState();
        this.players = [];
        this.cycles = [];
    }

    public getActivePlayers(teamName: string, cycleIndex: number): Set<Player> {
        // If there's no cycles at that index, then there are no active players
        if (cycleIndex >= this.cycles.length) {
            return new Set<Player>();
        }

        const players: Player[] = this.getPlayers(teamName);
        const activePlayers: Set<Player> = new Set<Player>(players.filter((player) => player.isStarter));

        // We should just have starters at the beginning. Then swap out new players, based on substitutions up to the
        // cycleIndex.
        for (let i = 0; i <= cycleIndex; i++) {
            const cycle: Cycle = this.cycles[i];
            const subs: ISubstitutionEvent[] | undefined = cycle.subs;
            const joins: IPlayerJoinsEvent[] | undefined = cycle.playerJoins;
            const leaves: IPlayerLeavesEvent[] | undefined = cycle.playerLeaves;

            if (subs == undefined && joins == undefined && leaves == undefined) {
                continue;
            }

            const teamLeaves: IPlayerLeavesEvent[] =
                leaves?.filter((leave) => leave.outPlayer.teamName === teamName) ?? [];
            for (const leave of teamLeaves) {
                const outPlayer: Player | undefined = players.find((player) => player.name === leave.outPlayer.name);
                if (outPlayer == undefined) {
                    throw new Error(
                        `Tried to take out ${leave.outPlayer.name} from the game, who isn't on team ${teamName}`
                    );
                }

                activePlayers.delete(outPlayer);
            }

            const teamJoins: IPlayerJoinsEvent[] = joins?.filter((join) => join.inPlayer.teamName === teamName) ?? [];
            for (const join of teamJoins) {
                const inPlayer: Player | undefined = players.find((player) => player.name === join.inPlayer.name);
                if (inPlayer == undefined) {
                    throw new Error(`Tried to add ${join.inPlayer.name}, who isn't on team ${teamName}`);
                }

                activePlayers.add(inPlayer);
            }

            const teamSubs: ISubstitutionEvent[] = subs?.filter((sub) => sub.inPlayer.teamName === teamName) ?? [];
            for (const sub of teamSubs) {
                const inPlayer = players.find((player) => player.name === sub.inPlayer.name);
                const outPlayer = players.find((player) => player.name === sub.outPlayer.name);

                if (inPlayer == undefined) {
                    throw new Error(
                        `Tried to substitute in player ${sub.inPlayer.name}, who isn't on team ${teamName}`
                    );
                } else if (outPlayer == undefined) {
                    throw new Error(
                        `Tried to substitute out player ${sub.outPlayer.name}, who isn't on team ${teamName}`
                    );
                }

                activePlayers.add(inPlayer);
                activePlayers.delete(outPlayer);
            }
        }

        return activePlayers;
    }

    // TODO: Make this return a set?
    public getPlayers(teamName: string): Player[] {
        return this.players.filter((player) => player.teamName === teamName);
    }

    public getBonus(cycleIndex: number): Bonus | undefined {
        return this.packet.bonuses[this.getBonusIndex(cycleIndex)];
    }

    public getBonusIndex(cycleIndex: number): number {
        const previousCycleIndex: number = cycleIndex - 1;
        let usedBonusesCount = 0;
        for (let i = 0; i <= cycleIndex; i++) {
            const cycle = this.cycles[i];
            if (cycle.correctBuzz != undefined && i <= previousCycleIndex) {
                usedBonusesCount++;
            }

            if (cycle.thrownOutBonuses != undefined) {
                usedBonusesCount += cycle.thrownOutBonuses.length;
            }
        }

        return usedBonusesCount >= this.packet.bonuses.length ? -1 : usedBonusesCount;
    }

    public getTossup(cycleIndex: number): Tossup | undefined {
        return this.packet.tossups[this.getTossupIndex(cycleIndex)];
    }

    public getTossupIndex(cycleIndex: number): number {
        let thrownOutTossupsCount = 0;
        for (let i = 0; i <= cycleIndex; i++) {
            const cycle: Cycle = this.cycles[i];
            if (cycle.thrownOutTossups !== undefined) {
                thrownOutTossupsCount += cycle.thrownOutTossups.length;
            }
        }

        return cycleIndex + thrownOutTossupsCount;
    }

    @action
    public loadPacket(packet: PacketState): void {
        this.packet = packet;

        if (this.cycles.length < this.packet.tossups.length) {
            // TODO: Don't create cycles for tiebreaker rounds once we create packet formats to specify limits
            for (let i = this.cycles.length; i < this.packet.tossups.length; i++) {
                this.cycles.push(new Cycle());
            }
        }
    }
}
