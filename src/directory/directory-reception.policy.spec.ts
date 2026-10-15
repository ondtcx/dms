import { resolveReceptionCapabilities, canGrantReceptionDelegate } from './directory-reception.policy';

const base = { ownerId: 'owner', userId: 'user', directParticipant: null, roleParticipants: [], delegate: null };

describe('reception capabilities', () => {
  it('keeps the owner authorized without participant membership', () => {
    expect(resolveReceptionCapabilities({ ...base, userId: 'owner' })).toMatchObject({
      discover: true, configure: true, manageParticipants: true, readAll: true,
      review: true, manageDelegates: true, manageStructure: true,
    });
  });

  it('does not grant an institutional administrator implicit capabilities', () => {
    expect(resolveReceptionCapabilities(base).discover).toBe(false);
  });

  it('unions live eligibility and uses restrictive role peer visibility', () => {
    expect(resolveReceptionCapabilities({ ...base, roleParticipants: [{ peerRead: true }, { peerRead: false }] }))
      .toMatchObject({ submit: true, peerRead: false, review: false, readAll: false });
  });

  it('lets an explicit participant rule override role peer visibility', () => {
    expect(resolveReceptionCapabilities({ ...base, directParticipant: { peerRead: true }, roleParticipants: [{ peerRead: false }] }))
      .toMatchObject({ submit: true, peerRead: true, review: false });
  });

  it('honors direct peer denial over an allowing role', () => {
    expect(resolveReceptionCapabilities({ ...base, directParticipant: { peerRead: false }, roleParticipants: [{ peerRead: true }] }))
      .toMatchObject({ submit: true, peerRead: false });
  });

  it('revokes participant capabilities when current eligibility disappears', () => {
    expect(resolveReceptionCapabilities(base)).toMatchObject({ discover: false, submit: false, peerRead: false });
  });

  it('makes review imply read-all without granting submission or management', () => {
    expect(resolveReceptionCapabilities({ ...base, delegate: { review: true } }))
      .toMatchObject({ discover: true, readAll: true, review: true, submit: false, configure: false });
  });

  it('gives full delegates operational permissions without ownership', () => {
    expect(resolveReceptionCapabilities({ ...base, delegate: { full: true } }))
      .toMatchObject({ owner: false, configure: true, manageStructure: true, manageDelegates: true, submit: false });
  });

  it('rejects self-escalation and grants outside the actor ceiling', () => {
    const actor = resolveReceptionCapabilities({ ...base, delegate: { manageDelegates: true, readAll: true } });
    expect(canGrantReceptionDelegate(actor, 'user', 'user', { readAll: true })).toBe(false);
    expect(canGrantReceptionDelegate(actor, 'user', 'other', { review: true })).toBe(false);
    expect(canGrantReceptionDelegate(actor, 'user', 'other', { full: true })).toBe(false);
    expect(canGrantReceptionDelegate(actor, 'user', 'other', { readAll: true })).toBe(true);
  });

  it('checks implied read-all in the delegate ceiling', () => {
    const actor = resolveReceptionCapabilities(base);
    expect(canGrantReceptionDelegate(actor, 'user', 'other', {})).toBe(false);
  });
});
