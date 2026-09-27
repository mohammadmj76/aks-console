<template>
  <header class="topbar">
    <div class="brand">
      <div class="mark">Ar</div>
      <span class="text-body-2-strong">Arvan Console</span>
    </div>
    <nav class="topnav">
      <a href="#" @click.prevent>Compute</a>
      <a href="#" class="active" @click.prevent>Containers</a>
      <a href="#" @click.prevent>Network</a>
      <a href="#" @click.prevent>Storage</a>
      <a href="#" @click.prevent>Billing</a>
    </nav>
    <div class="spacer"></div>
    <label class="ar-input search">
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="m10.5 10.5 3 3"/></svg>
      <input type="search" placeholder="Search resources…" />
    </label>
    <button class="ar-btn ghost icon bell" title="Notifications" @click.prevent>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M8 2a4 4 0 0 0-4 4v2.5L2.8 11h10.4L12 8.5V6a4 4 0 0 0-4-4Z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/></svg>
      <span class="dot"></span>
    </button>
    <div class="user-chip">
      <div class="who">
        <div class="name">Mohammad Jafarabadi</div>
        <div class="sub">IaaS.QA · admin</div>
      </div>
      <div class="avatar">MJ</div>
    </div>
  </header>
</template>
